/**
 * IndexMapper — bidirectional translation between *physical* indices (the stable
 * identity of a row/column in the underlying data source) and *visual* indices
 * (the position a user sees after hiding, moving, and re-ordering).
 *
 * This is the foundation for hide/show, move, sort, filter, and trim: every one
 * of those features is expressed as a mutation of the visual order and/or the
 * hidden set, and the rest of Lattica only ever asks "what physical index sits
 * at visual position N?" (and vice versa).
 *
 * Internals:
 * - `order` is an array of physical indices in *visual order*, INCLUDING hidden
 *   ones. Keeping hidden indices in `order` makes the order stable across
 *   hide/unhide cycles (an unhidden row reappears where it was, not at the end).
 * - `hidden` is a Set of physical indices currently hidden.
 * - The visual→physical and physical→visual lookup arrays are cached and rebuilt
 *   lazily behind a `dirty` flag so lookups are O(1).
 *
 * Every mutation marks the caches dirty and notifies subscribers.
 */

export class IndexMapper {
  /** Physical indices in visual order, including hidden ones. */
  private order: number[] = [];
  /** Physical indices that are currently hidden. */
  private readonly hidden = new Set<number>();

  /** Cache: visible visual position -> physical index. */
  private visibleToPhysical: number[] = [];
  /** Cache: physical index -> visible visual position (or -1 if hidden). */
  private physicalToVisual: number[] = [];
  private dirty = true;

  private readonly listeners = new Set<() => void>();

  constructor(length: number) {
    this.initIdentity(length);
  }

  /** Total physical count (including hidden). */
  get length(): number {
    return this.order.length;
  }

  /** Number of not-hidden indices. */
  get visibleCount(): number {
    return this.order.length - this.hidden.size;
  }

  /**
   * Physical index sitting at the given visible visual position.
   * Returns -1 if `visual` is out of range.
   */
  getPhysicalIndex(visual: number): number {
    this.rebuild();
    if (visual < 0 || visual >= this.visibleToPhysical.length) {
      return -1;
    }
    return this.visibleToPhysical[visual]!;
  }

  /**
   * Visible visual position of the given physical index.
   * Returns -1 if the physical index is hidden or out of range.
   */
  getVisualIndex(physical: number): number {
    this.rebuild();
    if (physical < 0 || physical >= this.physicalToVisual.length) {
      return -1;
    }
    return this.physicalToVisual[physical]!;
  }

  /** Is the given physical index hidden? */
  isHidden(physical: number): boolean {
    return this.hidden.has(physical);
  }

  /**
   * Hide or show the given physical indices. Out-of-range and duplicate entries
   * are ignored. No-op mutations still notify (the caller asked for a change).
   */
  setHidden(physical: number[], hidden: boolean): void {
    for (const p of physical) {
      if (p < 0 || p >= this.order.length) {
        continue;
      }
      if (hidden) {
        this.hidden.add(p);
      } else {
        this.hidden.delete(p);
      }
    }
    this.markDirtyAndEmit();
  }

  /** Hidden physical indices, sorted ascending. */
  getHidden(): number[] {
    return [...this.hidden].sort((a, b) => a - b);
  }

  /** Physical indices in visual order, excluding hidden ones. */
  getVisibleIndexes(): number[] {
    this.rebuild();
    return [...this.visibleToPhysical];
  }

  /**
   * Reorder a run of `count` visible items starting at visual position
   * `fromVisual` so it sits before visual position `toVisual`. Operates in
   * visual space (hidden items keep their relative slots in `order`).
   *
   * Out-of-range / empty / no-op moves leave the order unchanged but still
   * notify.
   */
  move(fromVisual: number, count: number, toVisual: number): void {
    this.rebuild();
    const visibleCount = this.visibleToPhysical.length;
    if (
      count <= 0 ||
      fromVisual < 0 ||
      fromVisual + count > visibleCount ||
      toVisual < 0 ||
      toVisual > visibleCount
    ) {
      this.markDirtyAndEmit();
      return;
    }
    // A move that lands inside or immediately after the moved run is a no-op.
    if (toVisual >= fromVisual && toVisual <= fromVisual + count) {
      this.markDirtyAndEmit();
      return;
    }

    // Translate the visible run + target into positions within `order`.
    const movedPhysical = this.visibleToPhysical.slice(fromVisual, fromVisual + count);
    const moved = new Set(movedPhysical);
    // Physical index that the target visual position currently sits *before*;
    // undefined means "append after the last visible item".
    const targetPhysical = toVisual < visibleCount ? this.visibleToPhysical[toVisual]! : undefined;

    const remaining = this.order.filter((p) => !moved.has(p));
    const result: number[] = [];
    let inserted = false;
    for (const p of remaining) {
      if (!inserted && p === targetPhysical) {
        result.push(...movedPhysical);
        inserted = true;
      }
      result.push(p);
    }
    if (!inserted) {
      result.push(...movedPhysical);
    }
    this.order = result;
    this.markDirtyAndEmit();
  }

  /**
   * Replace the entire visual order. `physicalOrder` must be a permutation of
   * `0..length-1` (each physical index exactly once). The hidden set is
   * preserved. Throws RangeError on a malformed permutation.
   */
  setOrder(physicalOrder: number[]): void {
    const n = this.order.length;
    if (physicalOrder.length !== n) {
      throw new RangeError(
        `setOrder expected a permutation of length ${n}, got length ${physicalOrder.length}`,
      );
    }
    const seen = new Set<number>();
    for (const p of physicalOrder) {
      if (!Number.isInteger(p) || p < 0 || p >= n || seen.has(p)) {
        throw new RangeError(`setOrder requires a permutation of 0..${n - 1}, got invalid entry ${p}`);
      }
      seen.add(p);
    }
    this.order = [...physicalOrder];
    this.markDirtyAndEmit();
  }

  /**
   * Insert `count` new physical indices starting at physical position
   * `atPhysical`. Existing physical indices >= `atPhysical` shift up by `count`;
   * the new indices are appended into the visual order at the visual position of
   * the (shifted) item that was previously at `atPhysical`, so they appear in
   * source order at the insertion point. New indices are visible.
   *
   * `count <= 0` is a no-op (still notifies). `atPhysical` is clamped to
   * `[0, length]`.
   */
  insert(atPhysical: number, count: number): void {
    if (count <= 0) {
      this.markDirtyAndEmit();
      return;
    }
    const n = this.order.length;
    const at = Math.max(0, Math.min(atPhysical, n));

    // Shift hidden physical indices that are at/after the insertion point.
    const shiftedHidden = new Set<number>();
    for (const p of this.hidden) {
      shiftedHidden.add(p >= at ? p + count : p);
    }
    this.hidden.clear();
    for (const p of shiftedHidden) {
      this.hidden.add(p);
    }

    // Shift order entries, then splice the new physical indices in at the visual
    // slot occupied by the first shifted entry (or append if inserting at end).
    const shiftedOrder = this.order.map((p) => (p >= at ? p + count : p));
    const newIndices: number[] = [];
    for (let i = 0; i < count; i++) {
      newIndices.push(at + i);
    }
    let insertPos = shiftedOrder.findIndex((p) => p === at + count);
    if (insertPos === -1) {
      insertPos = shiftedOrder.length;
    }
    shiftedOrder.splice(insertPos, 0, ...newIndices);
    this.order = shiftedOrder;
    this.markDirtyAndEmit();
  }

  /**
   * Remove the given physical indices. Remaining physical indices are renumbered
   * to stay contiguous (`0..newLength-1`), preserving their visual order, and
   * removed indices are dropped from both the hidden set and the order.
   * Out-of-range / duplicate entries are ignored.
   */
  remove(physical: number[]): void {
    const toRemove = new Set<number>();
    for (const p of physical) {
      if (p >= 0 && p < this.order.length) {
        toRemove.add(p);
      }
    }
    if (toRemove.size === 0) {
      this.markDirtyAndEmit();
      return;
    }

    // Build a renumber map: surviving physical index -> new index.
    const remap = new Map<number, number>();
    let next = 0;
    for (let p = 0; p < this.order.length; p++) {
      if (!toRemove.has(p)) {
        remap.set(p, next++);
      }
    }

    this.order = this.order
      .filter((p) => !toRemove.has(p))
      .map((p) => remap.get(p)!);

    const survivingHidden: number[] = [];
    for (const p of this.hidden) {
      if (!toRemove.has(p)) {
        survivingHidden.push(remap.get(p)!);
      }
    }
    this.hidden.clear();
    for (const p of survivingHidden) {
      this.hidden.add(p);
    }

    this.markDirtyAndEmit();
  }

  /** Reset to the identity order of a new length, with nothing hidden. */
  reset(length: number): void {
    this.initIdentity(length);
    this.markDirtyAndEmit();
  }

  /** Subscribe to mutations. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Establish the identity order `0..length-1` with nothing hidden. */
  private initIdentity(length: number): void {
    if (length < 0) {
      throw new RangeError(`length must be >= 0, got ${length}`);
    }
    this.order = new Array<number>(length);
    for (let i = 0; i < length; i++) {
      this.order[i] = i;
    }
    this.hidden.clear();
    this.dirty = true;
  }

  /** Rebuild the lookup caches if dirty. */
  private rebuild(): void {
    if (!this.dirty) {
      return;
    }
    this.physicalToVisual = new Array<number>(this.order.length).fill(-1);
    this.visibleToPhysical = [];
    for (const physical of this.order) {
      if (this.hidden.has(physical)) {
        continue;
      }
      this.physicalToVisual[physical] = this.visibleToPhysical.length;
      this.visibleToPhysical.push(physical);
    }
    this.dirty = false;
  }

  private markDirtyAndEmit(): void {
    this.dirty = true;
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}
