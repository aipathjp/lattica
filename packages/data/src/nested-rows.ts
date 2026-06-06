/**
 * NESTED ROWS / row-grouping model — a pure description of a parent/child row
 * tree with collapse state, producing the set of PHYSICAL rows to HIDE.
 *
 * The model never touches the data source or the {@link IndexMapper} directly.
 * Instead, callers describe the tree as {@link NestedRowNode}s keyed by physical
 * row index, drive collapse state, and read {@link NestedRowModel.hiddenRows}.
 * That sorted, de-duplicated list is exactly what you feed to
 * `IndexMapper.setHidden(rows, true)`.
 *
 * Semantics:
 * - Collapsing a parent hides ALL of its descendants (recursively); the
 *   collapsed parent row itself stays visible.
 * - A descendant of two collapsed ancestors is hidden exactly once.
 * - {@link NestedRowModel.getDepth} reflects nesting (0 for roots, `-1` if the
 *   row is not in the tree).
 * - {@link NestedRowModel.toggle} / {@link NestedRowModel.setCollapsed} on a leaf
 *   (a row with no children) are no-ops.
 *
 * Duplicate rows in the tree are not expected; maps are built straight from the
 * provided tree.
 *
 * The class mirrors {@link IndexMapper}'s subscription mechanism.
 */

/** A node in the nested-row tree, keyed by physical row index. */
export interface NestedRowNode {
  row: number;
  children?: NestedRowNode[];
}

export class NestedRowModel {
  /** Physical row -> nesting depth (0 for roots). */
  private depth = new Map<number, number>();
  /** Physical row -> its direct children's physical rows. */
  private childrenOf = new Map<number, number[]>();
  /** Physical rows that are currently collapsed. */
  private collapsed = new Set<number>();

  private readonly listeners = new Set<() => void>();

  constructor(roots: readonly NestedRowNode[]) {
    this.buildMaps(roots);
  }

  /** Replace the tree. Collapse state is reset (everything expanded). */
  setTree(roots: readonly NestedRowNode[]): void {
    this.buildMaps(roots);
    this.collapsed.clear();
    this.emit();
  }

  /** Does the given physical row have at least one child? */
  isParent(row: number): boolean {
    const children = this.childrenOf.get(row);
    return children !== undefined && children.length > 0;
  }

  /** Nesting depth of a physical row: 0 for roots, `-1` if not in the tree. */
  getDepth(row: number): number {
    const d = this.depth.get(row);
    return d === undefined ? -1 : d;
  }

  /** Collapse/expand a parent. No-op for leaves (rows without children). */
  toggle(row: number): void {
    if (!this.isParent(row)) {
      return;
    }
    if (this.collapsed.has(row)) {
      this.collapsed.delete(row);
    } else {
      this.collapsed.add(row);
    }
    this.emit();
  }

  /** Is the given physical row currently collapsed? */
  isCollapsed(row: number): boolean {
    return this.collapsed.has(row);
  }

  /** Explicitly set collapse state for a parent. No-op for leaves. */
  setCollapsed(row: number, value: boolean): void {
    if (!this.isParent(row)) {
      return;
    }
    if (value) {
      this.collapsed.add(row);
    } else {
      this.collapsed.delete(row);
    }
    this.emit();
  }

  /**
   * Physical rows hidden because an ANCESTOR is collapsed, sorted ascending and
   * de-duplicated. The collapsed parent itself stays visible.
   */
  hiddenRows(): number[] {
    const hidden = new Set<number>();
    for (const row of this.collapsed) {
      this.collectDescendants(row, hidden);
    }
    return [...hidden].sort((a, b) => a - b);
  }

  /** Subscribe to mutations. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Add every descendant of `row` (not `row` itself) to `out`. */
  private collectDescendants(row: number, out: Set<number>): void {
    const children = this.childrenOf.get(row);
    /* v8 ignore next 3 -- defensive: every tree row has a children entry (leaves map to []), so this is never reached */
    if (children === undefined) {
      return;
    }
    for (const child of children) {
      out.add(child);
      this.collectDescendants(child, out);
    }
  }

  /** Build the depth and children maps from a tree. */
  private buildMaps(roots: readonly NestedRowNode[]): void {
    this.depth = new Map<number, number>();
    this.childrenOf = new Map<number, number[]>();
    this.walk(roots, 0);
  }

  /** Depth-first walk recording each node's depth and direct children. */
  private walk(nodes: readonly NestedRowNode[], depth: number): void {
    for (const node of nodes) {
      this.depth.set(node.row, depth);
      const children = node.children ?? [];
      this.childrenOf.set(
        node.row,
        children.map((child) => child.row),
      );
      this.walk(children, depth + 1);
    }
  }

  private emit(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}
