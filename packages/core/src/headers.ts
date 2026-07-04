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
 *
 * Two layout affordances support multi-line / unit-row headers:
 *
 * - **Multi-line labels** — a `headerName` may contain `"\n"`; renderers show
 *   it as line breaks (`white-space: pre-line`). {@link HeaderLayout.rowLineCounts}
 *   reports, per header row, the number of label lines that must fit so the
 *   renderer can auto-expand row heights.
 * - **Unit-less columns** — a leaf placed directly at a shallower depth (the
 *   recommended form: simply omit the unit level) gets a `rowSpan` down to the
 *   bottom header row. As an equivalent normalization, a non-collapsible group
 *   whose only child is a leaf with an empty `headerName` is *absorbed*: no
 *   empty unit cell is emitted and the parent cell extends down instead,
 *   keeping the child's leaf metadata (`field` etc.).
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
  /** Consumer-defined column type (stored only in core). */
  readonly type?: string;
  /** Custom editor kind registered in the view layer's editor registry. */
  readonly editor?: string;
  /** Whether UI editing should be allowed for this column. */
  readonly editable?: boolean;
  /** Preferred text alignment. */
  readonly align?: 'left' | 'center' | 'right';
  /** Excel-style number format pattern. */
  readonly format?: string;
  /** Dropdown/autocomplete option list. */
  readonly options?: readonly string[];
  /** Maximum edit length for default text input handling. */
  readonly maxLength?: number;
  /** Wrap cell text onto multiple lines when it exceeds the column width. */
  readonly wrap?: boolean;
  /**
   * Full-width (zenkaku) numeric input policy for `number`/`time` columns:
   * normalize to half-width (default), reject the commit, or leave as-is.
   */
  readonly fullWidthMode?: 'reject' | 'normalize' | 'off';
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
  /**
   * Per header row (top to bottom), the maximum number of `"\n"`-separated
   * label lines that must fit in that row. A cell spanning several rows
   * distributes its lines evenly across them (`ceil(lines / rowSpan)`).
   * Always `1` for single-line labels; length equals {@link depth}.
   */
  readonly rowLineCounts: readonly number[];
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

/**
 * A non-collapsible group whose only visible child is a leaf with an empty
 * `headerName` is *absorbed*: the group renders as a single leaf-like cell
 * (keeping the child's column metadata) that spans down to the bottom header
 * row, instead of emitting an empty unit cell. Collapsible groups are never
 * absorbed so their toggle chevron stays reachable.
 */
function isAbsorbedGroup(vn: VisibleNode): boolean {
  return (
    isGroup(vn.node) &&
    vn.node.collapsible !== true &&
    vn.children.length === 1 &&
    vn.children[0]!.children.length === 0 &&
    (vn.children[0]!.node as ColumnDef).headerName === ''
  );
}

function heightOf(vn: VisibleNode): number {
  if (vn.children.length === 0 || isAbsorbedGroup(vn)) {
    return 1;
  }
  let max = 0;
  for (const child of vn.children) {
    max = Math.max(max, heightOf(child));
  }
  return 1 + max;
}

/** Number of `"\n"`-separated lines in a header label (at least 1). */
function labelLineCount(label: string): number {
  let count = 1;
  for (let i = 0; i < label.length; i++) {
    if (label[i] === '\n') {
      count++;
    }
  }
  return count;
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
    return { rows: [], leaves: [], depth: 0, rowLineCounts: [] };
  }

  const totalRows = visible.reduce((m, vn) => Math.max(m, heightOf(vn)), 0);
  const rows: HeaderCell[][] = Array.from({ length: totalRows }, () => []);
  const leaves: VisibleLeaf[] = [];
  let leafCounter = 0;

  const emitLeafCell = (id: string, label: string, def: ColumnDef, depth: number): void => {
    const leafIndex = leafCounter++;
    leaves.push({ id, def, leafIndex });
    rows[depth]!.push({
      id,
      label,
      depth,
      rowSpan: totalRows - depth,
      startLeaf: leafIndex,
      endLeaf: leafIndex + 1,
      colSpan: 1,
      isGroup: false,
      collapsible: false,
      collapsed: false,
    });
  };

  const emit = (vn: VisibleNode, depth: number): void => {
    if (vn.children.length === 0) {
      const def = vn.node as ColumnDef;
      emitLeafCell(vn.id, def.headerName, def, depth);
      return;
    }
    if (isAbsorbedGroup(vn)) {
      // Unit-less column written as `group('Item') → leaf('')`: keep the
      // child's leaf metadata but label the merged cell with the group name.
      const child = vn.children[0]!;
      emitLeafCell(child.id, vn.node.headerName, child.node as ColumnDef, depth);
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

  const rowLineCounts: number[] = Array.from({ length: totalRows }, () => 1);
  for (const row of rows) {
    for (const cell of row) {
      const perRow = Math.ceil(labelLineCount(cell.label) / cell.rowSpan);
      for (let r = cell.depth; r < cell.depth + cell.rowSpan; r++) {
        rowLineCounts[r] = Math.max(rowLineCounts[r]!, perRow);
      }
    }
  }

  return { rows, leaves, depth: totalRows, rowLineCounts };
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
