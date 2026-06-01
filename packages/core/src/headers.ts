/**
 * Multi-level grouping headers.
 *
 * Columns are declared as a *tree*: leaf {@link ColumnDef}s and intermediate
 * {@link ColumnGroupDef}s nested to any depth. {@link computeHeaderLayout}
 * flattens the tree into rows of {@link HeaderCell}s (with row/col spans) plus
 * the ordered list of currently-visible leaf columns.
 *
 * Collapsing mirrors the AG Grid `columnGroupShow` model: each child declares
 * `showWhen` (`'always' | 'open' | 'closed'`); a collapsed group hides its
 * `'open'` children and a expanded group hides its `'closed'` children. This
 * is more flexible than a fixed two-state header and supports row-header
 * grouping by reusing the same flattening over a transposed tree.
 */

/** Visibility rule for a node relative to its parent group's collapse state. */
export type ShowWhen = 'always' | 'open' | 'closed';

export interface ColumnDef {
  /** Stable identifier. Auto-derived from tree position when omitted. */
  readonly id?: string;
  /** Underlying data field. */
  readonly field?: string;
  /** Header text. */
  readonly headerName: string;
  /** Fixed pixel width (consumed by the renderer, opaque here). */
  readonly width?: number;
  readonly showWhen?: ShowWhen;
}

export interface ColumnGroupDef {
  readonly id?: string;
  readonly headerName: string;
  readonly children: readonly ColumnNode[];
  /** Whether the group can be collapsed by the user. */
  readonly collapsible?: boolean;
  /** Initial collapsed state when collapsible. Default expanded. */
  readonly collapsedByDefault?: boolean;
  readonly showWhen?: ShowWhen;
}

export type ColumnNode = ColumnDef | ColumnGroupDef;

export function isGroup(node: ColumnNode): node is ColumnGroupDef {
  return (node as ColumnGroupDef).children !== undefined;
}

export interface HeaderCell {
  readonly id: string;
  readonly label: string;
  /** Row index in the header (0 = topmost). */
  readonly depth: number;
  readonly rowSpan: number;
  /** First visible-leaf index covered (inclusive). */
  readonly startLeaf: number;
  /** One past the last visible-leaf index covered (exclusive). */
  readonly endLeaf: number;
  readonly colSpan: number;
  readonly isGroup: boolean;
  readonly collapsible: boolean;
  readonly collapsed: boolean;
}

export interface VisibleLeaf {
  readonly id: string;
  readonly def: ColumnDef;
  /** Position among visible leaves. */
  readonly leafIndex: number;
}

export interface HeaderLayout {
  /** Header cells grouped per row, top to bottom. */
  readonly rows: readonly (readonly HeaderCell[])[];
  /** Visible leaf columns in display order. */
  readonly leaves: readonly VisibleLeaf[];
  /** Number of header rows. */
  readonly depth: number;
}

/** Derive a stable id from a node's path when one is not supplied. */
function nodeId(node: ColumnNode, path: string): string {
  return node.id ?? `col:${path}`;
}

function effectiveShow(node: ColumnNode): ShowWhen {
  return node.showWhen ?? 'always';
}

function childVisible(child: ColumnNode, parentCollapsed: boolean): boolean {
  const show = effectiveShow(child);
  if (show === 'always') {
    return true;
  }
  return parentCollapsed ? show === 'closed' : show === 'open';
}

/** Is this group currently collapsed, given the explicit collapse set? */
function groupCollapsed(group: ColumnGroupDef, id: string, collapsed: ReadonlySet<string>): boolean {
  if (group.collapsible !== true) {
    return false;
  }
  if (collapsed.has(id)) {
    return true;
  }
  // A collapsible group with collapsedByDefault is collapsed unless explicitly expanded.
  return group.collapsedByDefault === true && !collapsed.has(`!${id}`);
}

interface VisibleNode {
  readonly node: ColumnNode;
  readonly id: string;
  readonly collapsedSelf: boolean;
  readonly children: VisibleNode[];
}

/** Build the visible subtree, applying collapse rules. Returns null if a group has no visible leaves. */
function buildVisible(
  node: ColumnNode,
  path: string,
  collapsed: ReadonlySet<string>,
): VisibleNode | null {
  const id = nodeId(node, path);
  if (!isGroup(node)) {
    return { node, id, collapsedSelf: false, children: [] };
  }
  const selfCollapsed = groupCollapsed(node, id, collapsed);
  const children: VisibleNode[] = [];
  node.children.forEach((child, i) => {
    if (!childVisible(child, selfCollapsed)) {
      return;
    }
    const built = buildVisible(child, `${path}/${i}`, collapsed);
    if (built !== null) {
      children.push(built);
    }
  });
  if (children.length === 0) {
    return null; // Group contributes no leaves; drop it.
  }
  return { node, id, collapsedSelf: selfCollapsed, children };
}

function heightOf(vn: VisibleNode): number {
  if (vn.children.length === 0) {
    return 1;
  }
  let max = 0;
  for (const child of vn.children) {
    max = Math.max(max, heightOf(child));
  }
  return 1 + max;
}

/**
 * Flatten a column tree into a render-ready header layout.
 *
 * @param nodes top-level column nodes
 * @param collapsed set of collapsed group ids (and `!id` markers for groups
 *   explicitly expanded against a `collapsedByDefault`)
 */
export function computeHeaderLayout(
  nodes: readonly ColumnNode[],
  collapsed: ReadonlySet<string> = new Set(),
): HeaderLayout {
  const visible: VisibleNode[] = [];
  nodes.forEach((node, i) => {
    const built = buildVisible(node, String(i), collapsed);
    if (built !== null) {
      visible.push(built);
    }
  });

  if (visible.length === 0) {
    return { rows: [], leaves: [], depth: 0 };
  }

  const totalRows = visible.reduce((m, vn) => Math.max(m, heightOf(vn)), 0);
  const rows: HeaderCell[][] = Array.from({ length: totalRows }, () => []);
  const leaves: VisibleLeaf[] = [];
  let leafCounter = 0;

  const emit = (vn: VisibleNode, depth: number): void => {
    if (vn.children.length === 0) {
      const leafIndex = leafCounter++;
      const def = vn.node as ColumnDef;
      leaves.push({ id: vn.id, def, leafIndex });
      rows[depth]!.push({
        id: vn.id,
        label: def.headerName,
        depth,
        rowSpan: totalRows - depth,
        startLeaf: leafIndex,
        endLeaf: leafIndex + 1,
        colSpan: 1,
        isGroup: false,
        collapsible: false,
        collapsed: false,
      });
      return;
    }
    const start = leafCounter;
    for (const child of vn.children) {
      emit(child, depth + 1);
    }
    const end = leafCounter;
    const group = vn.node as ColumnGroupDef;
    rows[depth]!.push({
      id: vn.id,
      label: group.headerName,
      depth,
      rowSpan: 1,
      startLeaf: start,
      endLeaf: end,
      colSpan: end - start,
      isGroup: true,
      collapsible: group.collapsible === true,
      collapsed: vn.collapsedSelf,
    });
  };

  for (const vn of visible) {
    emit(vn, 0);
  }

  return { rows, leaves, depth: totalRows };
}

/**
 * Stateful wrapper that tracks collapse toggles and recomputes the layout.
 * Kept separate from {@link computeHeaderLayout} so the flattening stays pure.
 */
export class HeaderModel {
  private nodes: readonly ColumnNode[];
  private readonly collapsed = new Set<string>();
  private readonly listeners = new Set<() => void>();

  constructor(nodes: readonly ColumnNode[]) {
    this.nodes = nodes;
  }

  setColumns(nodes: readonly ColumnNode[]): void {
    this.nodes = nodes;
    this.emit();
  }

  getLayout(): HeaderLayout {
    return computeHeaderLayout(this.nodes, this.collapsed);
  }

  /** Toggle a collapsible group's collapsed state by id. */
  toggle(groupId: string): void {
    // We need to know its default to record the right marker. Find it in layout.
    const layout = this.getLayout();
    const cell = this.findGroupCell(layout, groupId);
    const currentlyCollapsed = cell?.collapsed ?? this.collapsed.has(groupId);
    this.setCollapsed(groupId, !currentlyCollapsed);
  }

  /** Explicitly set a group's collapsed state. */
  setCollapsed(groupId: string, value: boolean): void {
    // Clear any prior markers for this id, then set the appropriate one.
    this.collapsed.delete(groupId);
    this.collapsed.delete(`!${groupId}`);
    if (value) {
      this.collapsed.add(groupId);
    } else {
      // Mark explicitly-expanded so a collapsedByDefault group opens.
      this.collapsed.add(`!${groupId}`);
    }
    this.emit();
  }

  private findGroupCell(layout: HeaderLayout, id: string): HeaderCell | undefined {
    for (const row of layout.rows) {
      for (const cell of row) {
        if (cell.id === id) {
          return cell;
        }
      }
    }
    return undefined;
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
