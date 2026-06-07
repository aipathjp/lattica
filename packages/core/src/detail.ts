/**
 * DetailModel — tracks which "master" rows have their detail panel expanded
 * (master/detail). Pure and observable; the grid reserves extra height for an
 * expanded row and the consumer renders the detail content. Rows are keyed by
 * physical index so expansion survives sort/filter.
 */

export class DetailModel {
  private readonly expanded = new Set<number>();
  private readonly listeners = new Set<() => void>();

  /** Toggle the expanded state of a row. */
  toggle(row: number): void {
    if (this.expanded.has(row)) {
      this.expanded.delete(row);
    } else {
      this.expanded.add(row);
    }
    this.emit();
  }

  /** Expand a row's detail (no-op if already expanded). */
  expand(row: number): void {
    if (!this.expanded.has(row)) {
      this.expanded.add(row);
      this.emit();
    }
  }

  /** Collapse a row's detail (no-op if already collapsed). */
  collapse(row: number): void {
    if (this.expanded.delete(row)) {
      this.emit();
    }
  }

  isExpanded(row: number): boolean {
    return this.expanded.has(row);
  }

  /** All expanded rows, ascending. */
  expandedRows(): number[] {
    return [...this.expanded].sort((a, b) => a - b);
  }

  /** Collapse everything. */
  clear(): void {
    if (this.expanded.size > 0) {
      this.expanded.clear();
      this.emit();
    }
  }

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
