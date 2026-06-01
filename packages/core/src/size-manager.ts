/**
 * SizeManager — maps between index and pixel offset along one axis, supporting
 * a default size plus sparse per-index overrides (variable row heights /
 * column widths).
 *
 * Conversions are O(log n) via a lazily-built prefix-sum over the *overridden*
 * indices only; unoverridden runs are computed arithmetically from the default
 * size. This keeps memory proportional to the number of customized rows/cols,
 * not the total count — essential for million-row grids.
 */

export interface SizeManagerOptions {
  /** Number of indices on this axis. */
  count: number;
  /** Default size (px) for indices without an override. */
  defaultSize: number;
  /** Minimum allowed size (px) when resizing. */
  minSize?: number;
}

export class SizeManager {
  private count: number;
  private defaultSize: number;
  private readonly minSize: number;
  private readonly overrides = new Map<number, number>();

  /** Sorted list of overridden indices; rebuilt lazily after mutation. */
  private sortedKeys: number[] = [];
  /** Cumulative *extra* size (override - default) up to and including sortedKeys[i]. */
  private prefixExtra: number[] = [];
  private dirty = true;

  constructor(options: SizeManagerOptions) {
    if (options.count < 0) {
      throw new RangeError(`count must be >= 0, got ${options.count}`);
    }
    if (options.defaultSize <= 0) {
      throw new RangeError(`defaultSize must be > 0, got ${options.defaultSize}`);
    }
    this.count = options.count;
    this.defaultSize = options.defaultSize;
    this.minSize = options.minSize ?? 1;
  }

  /** Number of indices. */
  getCount(): number {
    return this.count;
  }

  /** Set the number of indices (e.g. after inserting/removing rows). */
  setCount(count: number): void {
    if (count < 0) {
      throw new RangeError(`count must be >= 0, got ${count}`);
    }
    this.count = count;
    // Drop overrides that fall outside the new range.
    for (const key of [...this.overrides.keys()]) {
      if (key >= count) {
        this.overrides.delete(key);
      }
    }
    this.dirty = true;
  }

  /** Size (px) of a single index. */
  getSize(index: number): number {
    return this.overrides.get(index) ?? this.defaultSize;
  }

  /** Override the size of one index (clamped to minSize). */
  setSize(index: number, size: number): void {
    if (index < 0 || index >= this.count) {
      throw new RangeError(`index ${index} out of bounds [0, ${this.count})`);
    }
    this.overrides.set(index, Math.max(this.minSize, size));
    this.dirty = true;
  }

  /** Remove an override, reverting the index to the default size. */
  resetSize(index: number): void {
    if (this.overrides.delete(index)) {
      this.dirty = true;
    }
  }

  /** Total pixel extent of all indices. */
  getTotalSize(): number {
    let extra = 0;
    for (const [, size] of this.overrides) {
      extra += size - this.defaultSize;
    }
    return this.count * this.defaultSize + extra;
  }

  /** Pixel offset of the leading edge of `index`. */
  getOffset(index: number): number {
    if (index <= 0) {
      return 0;
    }
    const clamped = Math.min(index, this.count);
    // Base offset assuming all default, plus accumulated extras before `clamped`.
    return clamped * this.defaultSize + this.extraBefore(clamped);
  }

  /**
   * Find the index whose span contains `offset`. Clamps to [0, count-1].
   * Returns 0 for an empty axis.
   */
  getIndexAt(offset: number): number {
    if (this.count === 0) {
      return 0;
    }
    if (offset <= 0) {
      return 0;
    }
    const total = this.getTotalSize();
    if (offset >= total) {
      return this.count - 1;
    }
    // Binary search for the largest index whose offset <= target.
    let lo = 0;
    let hi = this.count - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.getOffset(mid) <= offset) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }

  /** Sum of (override - default) for all overridden indices strictly below `index`. */
  private extraBefore(index: number): number {
    this.rebuild();
    if (this.sortedKeys.length === 0 || index <= 0) {
      return 0;
    }
    // Largest position p with sortedKeys[p] < index.
    let lo = 0;
    let hi = this.sortedKeys.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.sortedKeys[mid]! < index) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo === 0 ? 0 : this.prefixExtra[lo - 1]!;
  }

  private rebuild(): void {
    if (!this.dirty) {
      return;
    }
    this.sortedKeys = [...this.overrides.keys()].sort((a, b) => a - b);
    this.prefixExtra = new Array(this.sortedKeys.length);
    let acc = 0;
    for (let i = 0; i < this.sortedKeys.length; i++) {
      acc += this.overrides.get(this.sortedKeys[i]!)! - this.defaultSize;
      this.prefixExtra[i] = acc;
    }
    this.dirty = false;
  }
}
