/**
 * AsyncRowModel — a block-cached, lazily-loaded row model for server-side /
 * infinite data. The grid asks for a visible range; the model fetches the
 * covering fixed-size blocks through a {@link RowFetcher} (deduplicating
 * in-flight requests), caches them, and notifies subscribers as blocks arrive.
 * Rows not yet loaded read as `undefined`, so the renderer can show placeholders.
 *
 * Framework-agnostic and generic over the row shape `R`; no grid/React deps.
 */

/** One page of rows plus the total row count reported by the backend. */
export interface RowBlock<R> {
  rows: R[];
  total: number;
}

/** Fetch `limit` rows starting at `offset`. */
export type RowFetcher<R> = (offset: number, limit: number) => Promise<RowBlock<R>>;

export interface AsyncRowModelOptions<R> {
  fetcher: RowFetcher<R>;
  /** Rows per fetched block (default 100). */
  blockSize?: number;
}

export class AsyncRowModel<R> {
  private readonly fetcher: RowFetcher<R>;
  private readonly blockSize: number;
  private readonly blocks = new Map<number, R[]>();
  private readonly inflight = new Map<number, Promise<void>>();
  private readonly listeners = new Set<() => void>();
  private total = 0;
  private totalKnown = false;

  constructor(options: AsyncRowModelOptions<R>) {
    this.fetcher = options.fetcher;
    this.blockSize = Math.max(1, options.blockSize ?? 100);
  }

  /** Total row count, or 0 until the first block resolves. */
  getTotal(): number {
    return this.total;
  }

  /** Whether a fetch has reported the total yet. */
  isTotalKnown(): boolean {
    return this.totalKnown;
  }

  private blockOf(index: number): number {
    return Math.floor(index / this.blockSize);
  }

  /** Is the block containing `index` loaded? */
  isLoaded(index: number): boolean {
    return this.blocks.has(this.blockOf(index));
  }

  /** The row at `index` if its block is loaded, else undefined. */
  getRow(index: number): R | undefined {
    if (index < 0) {
      return undefined;
    }
    const block = this.blocks.get(this.blockOf(index));
    return block?.[index % this.blockSize];
  }

  /** Load (once) the block at `blockIndex`, caching the rows and total. */
  private loadBlock(blockIndex: number): Promise<void> {
    if (this.blocks.has(blockIndex)) {
      return Promise.resolve();
    }
    const existing = this.inflight.get(blockIndex);
    if (existing !== undefined) {
      return existing;
    }
    const promise = this.fetcher(blockIndex * this.blockSize, this.blockSize).then((block) => {
      this.blocks.set(blockIndex, block.rows);
      this.total = block.total;
      this.totalKnown = true;
      this.inflight.delete(blockIndex);
      this.emit();
    });
    this.inflight.set(blockIndex, promise);
    return promise;
  }

  /** Ensure every block covering the visual range `[start, end]` is loaded. */
  async ensureRange(start: number, end: number): Promise<void> {
    const from = Math.max(0, this.blockOf(start));
    const to = this.blockOf(Math.max(start, end));
    const pending: Promise<void>[] = [];
    for (let b = from; b <= to; b++) {
      pending.push(this.loadBlock(b));
    }
    await Promise.all(pending);
  }

  /** Drop all cached blocks and reset the total (e.g. after a sort/filter). */
  invalidate(): void {
    this.blocks.clear();
    this.inflight.clear();
    this.total = 0;
    this.totalKnown = false;
    this.emit();
  }

  /** Subscribe to load/invalidate notifications. Returns an unsubscribe fn. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
