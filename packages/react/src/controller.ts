/**
 * GridController — the headless model that the React component drives. It owns
 * the formula {@link SheetEngine}, row/column {@link SizeManager}s, the
 * {@link SelectionModel}, and an {@link UndoManager}, and exposes intent-level
 * methods (edit, move, delete, paste, resize). It is fully DOM-free and
 * therefore unit-testable on its own; the component is a thin view over it.
 */

import {
  SizeManager,
  SelectionModel,
  UndoManager,
  Emitter,
  ConditionalFormatModel,
  SearchState,
  searchGrid,
  MergeModel,
  ValidationModel,
  validators,
  aggregate,
  distinctValues,
  type AggregateFn,
  type Validator,
  type MergeArea,
  type Command,
  type CellAddress,
  type CfStyle,
  type SearchOptions,
  type CellValue,
  type FillDirection,
  forEachCell,
  normalizeRange,
  fillRegion,
} from '@lattica/core';
import {
  DataView,
  SortModel,
  FilterModel,
  NestedRowModel,
  filteredHiddenRows,
  type SortDirection,
  type FilterCondition,
  type NestedRowNode,
} from '@lattica/data';
import { SheetEngine, FormulaError, type CellContent } from '@lattica/formula';
import type { GridGeometry } from './geometry.js';
import type { CellAlign } from './cell-types.js';
import { editorKindForType, type EditorKind } from './editors.js';

export interface GridControllerOptions {
  rowCount: number;
  colCount: number;
  defaultRowHeight?: number;
  defaultColWidth?: number;
  rowHeaderWidth?: number;
  colHeaderHeight?: number;
  frozenRows?: number;
  frozenCols?: number;
}

export interface EditState {
  row: number;
  col: number;
  draft: string;
}

interface ControllerEvents {
  change: void;
  edit: EditState | null;
}

/** Format an engine value for display in a cell. */
export function formatValue(value: ReturnType<SheetEngine['getValue']>): string {
  if (FormulaError.is(value)) {
    return value.type;
  }
  if (value === null) {
    return '';
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  return String(value);
}

/** Escape a string for use as a literal inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replace occurrences of `query` in `text` honoring the search options used to
 * find it. `wholeCell` replaces the entire text when it matches; `regex` treats
 * `query` as a pattern; otherwise a literal global replace is performed. An
 * invalid regex leaves the text unchanged.
 */
export function replaceInText(
  text: string,
  query: string,
  replacement: string,
  options?: SearchOptions,
): string {
  const caseSensitive = options?.caseSensitive ?? false;
  const wholeCell = options?.wholeCell ?? false;
  const useRegex = options?.regex ?? false;
  const flags = caseSensitive ? 'g' : 'gi';
  try {
    const body = useRegex ? query : escapeRegExp(query);
    const re = new RegExp(wholeCell ? `^(?:${body})$` : body, flags);
    return text.replace(re, replacement);
  } catch {
    return text;
  }
}

export class GridController {
  readonly engine = new SheetEngine();
  /** Physical-indexed sizes (resize edits these by physical row/col). */
  readonly rowSizes: SizeManager;
  readonly colSizes: SizeManager;
  readonly selection: SelectionModel;
  readonly undo = new UndoManager();
  /** Conditional-format rules applied across the grid (value-based). */
  readonly conditionalFormat = new ConditionalFormatModel();
  /** Current search matches/navigation state. */
  readonly search = new SearchState();
  /** Merged cell areas (visual coordinates). */
  readonly merges = new MergeModel();
  /** Per-cell validation; invalid cells are tinted red. Keyed by physical coords. */
  readonly validation = new ValidationModel();
  /** Allowed option lists for dropdown/autocomplete columns (physical col). */
  private readonly columnOptions = new Map<number, readonly string[]>();
  /** View transform (sort/filter) mapping visual↔physical indices. */
  readonly view: DataView;
  private readonly sortModel = new SortModel();
  private readonly filterModel = new FilterModel();
  private readonly nestedRows = new NestedRowModel([]);
  private readonly columnTypes = new Map<number, string>();
  private readonly columnAligns = new Map<number, CellAlign>();
  private readonly searchKeys = new Set<string>();
  private readonly emitter = new Emitter<ControllerEvents>();

  private rowCount: number;
  private colCount: number;
  private readonly defaultRowHeight: number;
  private readonly defaultColWidth: number;
  /** Visible-indexed sizes derived from the view; consumed by geometry(). */
  private viewRowSizes: SizeManager;
  private viewColSizes: SizeManager;
  readonly rowHeaderWidth: number;
  readonly colHeaderHeight: number;
  frozenRows: number;
  frozenCols: number;

  private editState: EditState | null = null;

  constructor(options: GridControllerOptions) {
    this.rowCount = options.rowCount;
    this.colCount = options.colCount;
    this.defaultRowHeight = options.defaultRowHeight ?? 24;
    this.defaultColWidth = options.defaultColWidth ?? 100;
    this.rowSizes = new SizeManager({ count: options.rowCount, defaultSize: this.defaultRowHeight });
    this.colSizes = new SizeManager({ count: options.colCount, defaultSize: this.defaultColWidth });
    this.view = new DataView(options.rowCount, options.colCount);
    this.viewRowSizes = this.rowSizes;
    this.viewColSizes = this.colSizes;
    this.selection = new SelectionModel({
      rowCount: options.rowCount,
      colCount: options.colCount,
    });
    this.rowHeaderWidth = options.rowHeaderWidth ?? 48;
    this.colHeaderHeight = options.colHeaderHeight ?? 24;
    this.frozenRows = options.frozenRows ?? 0;
    this.frozenCols = options.frozenCols ?? 0;
    this.selection.subscribe(() => this.emitter.emit('change', undefined));
    // Repaint when the invalid-cell set changes (validation runs on commit).
    this.validation.subscribe(() => this.emitter.emit('change', undefined));
  }

  getRowCount(): number {
    return this.view.getRowCount();
  }
  getColCount(): number {
    return this.view.getColCount();
  }

  /** Map a visual cell to its physical address in the engine. */
  private toPhysical(row: number, col: number): { row: number; col: number } {
    return this.view.toPhysical(row, col);
  }

  /**
   * Rebuild the visible-indexed size managers from the view + physical sizes.
   * When the view is the identity (no sort/filter), this mirrors the physical
   * managers exactly, so behavior is unchanged.
   */
  private rebuildViewSizes(): void {
    const rows = this.view.getRowCount();
    const cols = this.view.getColCount();
    const vr = new SizeManager({ count: rows, defaultSize: this.defaultRowHeight });
    for (let v = 0; v < rows; v++) {
      const size = this.rowSizes.getSize(this.view.rows.getPhysicalIndex(v));
      if (size !== this.defaultRowHeight) {
        vr.setSize(v, size);
      }
    }
    const vc = new SizeManager({ count: cols, defaultSize: this.defaultColWidth });
    for (let v = 0; v < cols; v++) {
      const size = this.colSizes.getSize(this.view.cols.getPhysicalIndex(v));
      if (size !== this.defaultColWidth) {
        vc.setSize(v, size);
      }
    }
    this.viewRowSizes = vr;
    this.viewColSizes = vc;
  }

  /** A read-only accessor over the engine in physical coordinates. */
  private engineGet = (row: number, col: number): unknown => {
    const v = this.engine.getValue({ row, col });
    return FormulaError.is(v) ? v.type : v;
  };

  /**
   * Re-apply sort + (filter ∪ nested-collapse) hidden rows wholesale, refresh
   * sizes/selection, and emit. Managing hidden directly lets multiple sources
   * (column filters and nested-row collapse) combine cleanly.
   */
  private refreshView(): void {
    this.view.applySort(this.engineGet, this.sortModel.getConfigs());
    const filterHidden = filteredHiddenRows(
      this.view.rows.length,
      (pr, c) => this.engineGet(pr, c),
      this.filterModel.getFilters(),
    );
    const hide = new Set<number>([...filterHidden, ...this.nestedRows.hiddenRows()]);
    this.view.rows.setHidden(this.view.rows.getHidden(), false);
    this.view.rows.setHidden([...hide], true);
    this.rebuildViewSizes();
    this.selection.setDimensions(this.view.getRowCount(), this.view.getColCount());
    this.emitter.emit('change', undefined);
  }

  /** Toggle the sort on a (visual) column: none→asc→desc→none. */
  toggleSort(visualCol: number, additive = false): void {
    this.sortModel.toggle(this.view.cols.getPhysicalIndex(visualCol), additive);
    this.refreshView();
  }

  /** Replace the filter on a (visual) column. Empty conditions clear it. */
  setColumnFilter(visualCol: number, conditions: FilterCondition[], conjunction?: 'and' | 'or'): void {
    const col = this.view.cols.getPhysicalIndex(visualCol);
    if (conditions.length === 0) {
      this.filterModel.remove(col);
    } else {
      this.filterModel.set({ col, conditions, ...(conjunction ? { conjunction } : {}) });
    }
    this.refreshView();
  }

  /** Clear all sort and filter, returning to the identity view. */
  clearView(): void {
    this.sortModel.clear();
    this.filterModel.clear();
    this.refreshView();
  }

  /** Current sort direction for a (visual) column, or null. */
  getSortDirection(visualCol: number): SortDirection | null {
    const col = this.view.cols.getPhysicalIndex(visualCol);
    const config = this.sortModel.getConfigs().find((c) => c.col === col);
    return config ? config.direction : null;
  }

  // ── Column hide / move (visual ops over the column mapper) ──────────────────
  /** Rebuild sizes + selection dims after a column-mapper change, then emit. */
  private refreshColumns(): void {
    this.rebuildViewSizes();
    this.selection.setDimensions(this.view.getRowCount(), this.view.getColCount());
    this.emitter.emit('change', undefined);
  }

  /** Hide a (visual) column. */
  hideColumn(visualCol: number): void {
    this.view.cols.setHidden([this.view.cols.getPhysicalIndex(visualCol)], true);
    this.refreshColumns();
  }

  /** Show a previously-hidden (physical) column. */
  showColumn(physicalCol: number): void {
    this.view.cols.setHidden([physicalCol], false);
    this.refreshColumns();
  }

  /** Is the given physical column currently hidden? */
  isColumnHidden(physicalCol: number): boolean {
    return this.view.cols.isHidden(physicalCol);
  }

  /** Move `count` columns from one visual position to another. */
  moveColumn(fromVisual: number, toVisual: number, count = 1): void {
    this.view.cols.move(fromVisual, count, toVisual);
    this.refreshColumns();
  }

  // ── Faceted (set) filter & aggregation ─────────────────────────────────────
  /** Distinct values of a (visual) column across all physical rows, with labels. */
  columnFacets(visualCol: number): { value: CellValue; label: string }[] {
    const col = this.view.cols.getPhysicalIndex(visualCol);
    const values: CellValue[] = [];
    for (let r = 0; r < this.view.rows.length; r++) {
      values.push(this.engine.getValue({ row: r, col }) as CellValue);
    }
    return distinctValues(values, (v) => formatValue(v as never));
  }

  /** Apply a set (`in`) filter to a column; an empty list clears it. */
  setColumnSetFilter(visualCol: number, values: readonly CellValue[]): void {
    if (values.length === 0) {
      this.setColumnFilter(visualCol, []);
    } else {
      this.setColumnFilter(visualCol, [{ kind: 'in', values: [...values] }]);
    }
  }

  /** Aggregate a (visual) column over the currently visible rows. */
  aggregateColumn(visualCol: number, fn: AggregateFn): number | null {
    const rows = this.getRowCount();
    const values: CellValue[] = [];
    for (let r = 0; r < rows; r++) {
      const p = this.toPhysical(r, visualCol);
      values.push(this.engine.getValue(p) as CellValue);
    }
    return aggregate(values, fn);
  }

  // ── Find & replace ─────────────────────────────────────────────────────────
  /**
   * Replace `query` with `replacement` in every matching cell's editable text
   * (undoable, single transaction). Honors the same options as search. Returns
   * the number of cells changed.
   */
  replaceAll(query: string, replacement: string, options?: SearchOptions): number {
    if (query === '') {
      return 0;
    }
    const matches = searchGrid(
      this.getRowCount(),
      this.getColCount(),
      (r, c) => this.getDisplay(r, c),
      query,
      options,
    );
    let changed = 0;
    this.undo.transaction(() => {
      for (const m of matches) {
        const before = this.getEditText(m.row, m.col);
        const after = replaceInText(before, query, replacement, options);
        if (after !== before) {
          this.undo.execute(this.setContentCommand(this.toPhysical(m.row, m.col), after));
          changed++;
        }
      }
    });
    if (changed > 0) {
      this.emitter.emit('change', undefined);
    }
    return changed;
  }

  // ── Merged cells (visual coordinates) ──────────────────────────────────────
  /** The merge covering a (visual) cell, or null. */
  getMerge(row: number, col: number): MergeArea | null {
    return this.merges.getMergeAt(row, col);
  }

  /** Merge the current selection bounding box into one cell. */
  mergeSelection(): void {
    const b = normalizeRange(this.selection.getSelectionBounds());
    const area: MergeArea = {
      row: b.top,
      col: b.left,
      rowspan: b.bottom - b.top + 1,
      colspan: b.right - b.left + 1,
    };
    if (area.rowspan === 1 && area.colspan === 1) {
      return; // nothing to merge
    }
    this.merges.add(area);
    this.emitter.emit('change', undefined);
  }

  /** Remove the merge anchored at (or covering) a (visual) cell. */
  unmerge(row: number, col: number): void {
    const area = this.merges.getMergeAt(row, col);
    if (area !== null) {
      this.merges.remove(area.row, area.col);
      this.emitter.emit('change', undefined);
    }
  }

  // ── Nested rows (tree on physical rows; queries take visual rows) ──────────
  /** Define the row hierarchy (physical row indices) and refresh the view. */
  setRowTree(roots: readonly NestedRowNode[]): void {
    this.nestedRows.setTree(roots);
    this.refreshView();
  }
  /** Whether the (visual) row is a collapsible parent in the tree. */
  isRowParent(visualRow: number): boolean {
    return this.nestedRows.isParent(this.view.rows.getPhysicalIndex(visualRow));
  }
  /** Nesting depth of the (visual) row (0 = root, -1 = not in the tree). */
  getRowDepth(visualRow: number): number {
    return this.nestedRows.getDepth(this.view.rows.getPhysicalIndex(visualRow));
  }
  /** Whether the (visual) parent row is collapsed. */
  isRowCollapsed(visualRow: number): boolean {
    return this.nestedRows.isCollapsed(this.view.rows.getPhysicalIndex(visualRow));
  }
  /** Toggle collapse on the (visual) parent row, hiding/showing descendants. */
  toggleRowGroup(visualRow: number): void {
    this.nestedRows.toggle(this.view.rows.getPhysicalIndex(visualRow));
    this.refreshView();
  }

  /** Geometry snapshot for the renderer (visible-indexed). */
  geometry(): GridGeometry {
    return {
      rowSizes: this.viewRowSizes,
      colSizes: this.viewColSizes,
      frozenRows: this.frozenRows,
      frozenCols: this.frozenCols,
      rowHeaderWidth: this.rowHeaderWidth,
      colHeaderHeight: this.colHeaderHeight,
    };
  }

  /** Display text of a cell (computed value, formatted). */
  getDisplay(row: number, col: number): string {
    const p = this.toPhysical(row, col);
    return formatValue(this.engine.getValue(p));
  }

  /** Raw computed value of a cell (for value-based renderers / formatting). */
  getValue(row: number, col: number): unknown {
    const v = this.engine.getValue(this.toPhysical(row, col));
    return FormulaError.is(v) ? v.type : v;
  }

  /** Raw editable text of a cell (`=formula` or literal). */
  getEditText(row: number, col: number): string {
    const content = this.engine.getContent(this.toPhysical(row, col));
    return content === null ? '' : String(content);
  }

  // ── Column type & alignment (keyed by physical column) ─────────────────────
  setColumnType(col: number, type: string): void {
    this.columnTypes.set(col, type);
    this.emitter.emit('change', undefined);
  }
  getColumnType(visualCol: number): string | undefined {
    return this.columnTypes.get(this.view.cols.getPhysicalIndex(visualCol));
  }
  setColumnAlign(col: number, align: CellAlign): void {
    this.columnAligns.set(col, align);
    this.emitter.emit('change', undefined);
  }
  getColumnAlign(visualCol: number): CellAlign | undefined {
    return this.columnAligns.get(this.view.cols.getPhysicalIndex(visualCol));
  }

  // ── Editors, options & validation ──────────────────────────────────────────
  /**
   * Set the allowed option list for a column (used by `dropdown`/`autocomplete`
   * cell types). A `dropdown` column additionally gets a list validator so that
   * a value outside the options is flagged invalid.
   */
  setColumnOptions(col: number, options: readonly string[]): void {
    this.columnOptions.set(col, options);
    this.validation.setColumnValidator(col, validators.list(options));
    this.emitter.emit('change', undefined);
  }

  /** Options for a column (by visual index), or undefined when none set. */
  getColumnOptions(visualCol: number): readonly string[] | undefined {
    return this.columnOptions.get(this.view.cols.getPhysicalIndex(visualCol));
  }

  /** Set a custom validator on a (physical) column. */
  setColumnValidator(col: number, validator: Validator): void {
    this.validation.setColumnValidator(col, validator);
  }

  /** Which DOM editor a column should use, derived from its cell type. */
  getEditorKind(visualCol: number): EditorKind {
    return editorKindForType(this.getColumnType(visualCol));
  }

  /** Is the cell (visual coords) currently flagged invalid by validation? */
  isInvalid(visualRow: number, visualCol: number): boolean {
    const p = this.toPhysical(visualRow, visualCol);
    return this.validation.isInvalid(p.row, p.col);
  }

  // ── Conditional formatting & search styling ────────────────────────────────
  /** Combined per-cell style: conditional-format rule, overlaid by a search-hit tint. */
  getCellStyle(row: number, col: number): CfStyle | null {
    const p = this.toPhysical(row, col);
    let style = this.conditionalFormat.styleFor(this.engine.getValue(p) as never);
    if (this.searchKeys.has(`${row},${col}`)) {
      style = { ...(style ?? {}), background: '#fff3a3' };
    }
    // Invalid cells win visually (red tint), overlaying cf/search.
    if (this.validation.isInvalid(p.row, p.col)) {
      style = { ...(style ?? {}), background: '#ffd6d6', color: '#b00020' };
    }
    return style;
  }

  /** Run a search over displayed cell text, updating match state. Returns hit count. */
  runSearch(query: string, options?: SearchOptions): number {
    const matches = searchGrid(
      this.getRowCount(),
      this.getColCount(),
      (r, c) => this.getDisplay(r, c),
      query,
      options,
    );
    this.search.setMatches(matches);
    this.searchKeys.clear();
    for (const m of matches) {
      this.searchKeys.add(`${m.row},${m.col}`);
    }
    this.emitter.emit('change', undefined);
    return matches.length;
  }

  on<K extends keyof ControllerEvents>(event: K, handler: (p: ControllerEvents[K]) => void): () => void {
    return this.emitter.on(event, handler);
  }

  // ── Editing via undoable commands ─────────────────────────────────────────
  private parseInput(raw: string): CellContent {
    if (raw === '') {
      return null;
    }
    if (raw.startsWith('=')) {
      return raw;
    }
    // Numbers are stored as numbers so the formula engine treats them numerically.
    const num = Number(raw);
    if (raw.trim() !== '' && !Number.isNaN(num)) {
      return num;
    }
    if (raw === 'TRUE' || raw === 'FALSE') {
      return raw === 'TRUE';
    }
    return raw;
  }

  private setContentCommand(address: CellAddress, raw: string): Command {
    const previous = this.engine.getContent(address);
    const next = this.parseInput(raw);
    const engine = this.engine;
    const make = (value: CellContent, prior: CellContent): Command => ({
      label: `set ${address.row},${address.col}`,
      apply() {
        engine.setContent(address, value);
      },
      invert() {
        return make(prior, value);
      },
    });
    return make(next, previous);
  }

  /** Set a single cell's content (undoable) and emit a change. */
  setCellText(row: number, col: number, raw: string): void {
    this.undo.execute(this.setContentCommand(this.toPhysical(row, col), raw));
    this.emitter.emit('change', undefined);
  }

  /** Clear the currently selected cells (undoable batch). */
  deleteSelection(): void {
    const ranges = this.selection.getState().ranges;
    this.undo.transaction(() => {
      for (const range of ranges) {
        forEachCell(range, (addr) => {
          const p = this.toPhysical(addr.row, addr.col);
          if (this.engine.getContent(p) !== null) {
            this.undo.execute(this.setContentCommand(p, ''));
          }
        });
      }
    }, 'delete');
    this.emitter.emit('change', undefined);
  }

  /** Paste a matrix of text starting at the active cell (undoable batch). */
  paste(matrix: ReadonlyArray<readonly string[]>): void {
    const { active } = this.selection.getState();
    this.undo.transaction(() => {
      matrix.forEach((line, r) => {
        line.forEach((text, c) => {
          const row = active.row + r;
          const col = active.col + c;
          if (row < this.getRowCount() && col < this.getColCount()) {
            this.undo.execute(this.setContentCommand(this.toPhysical(row, col), text));
          }
        });
      });
    }, 'paste');
    this.emitter.emit('change', undefined);
  }

  /**
   * Fill-handle: extend the current selection's values to the cell at
   * `(targetRow, targetCol)` using series detection. The dominant axis (the
   * larger drag extent) wins; the produced values are written as one undoable
   * batch and the selection grows to cover them. A target inside the selection
   * is a no-op.
   */
  fillTo(targetRow: number, targetCol: number): void {
    const b = normalizeRange(this.selection.getSelectionBounds());
    const down = targetRow - b.bottom;
    const up = b.top - targetRow;
    const right = targetCol - b.right;
    const left = b.left - targetCol;
    const vertical = Math.max(down, up);
    const horizontal = Math.max(right, left);

    if (vertical <= 0 && horizontal <= 0) {
      return; // target within (or above-left of nothing) the selection
    }

    if (vertical >= horizontal) {
      const direction: FillDirection = down >= up ? 'down' : 'up';
      const count = direction === 'down' ? down : up;
      const seed = this.readBlock(b.top, b.left, b.bottom, b.right);
      const produced = fillRegion(seed, direction, count);
      const baseRow = direction === 'down' ? b.bottom + 1 : b.top - count;
      this.writeBlock(produced, baseRow, b.left);
      if (direction === 'down') {
        this.selection.setActive({ row: b.top, col: b.left });
        this.selection.extendTo({ row: b.bottom + count, col: b.right });
      } else {
        this.selection.setActive({ row: b.bottom, col: b.right });
        this.selection.extendTo({ row: b.top - count, col: b.left });
      }
    } else {
      const direction: FillDirection = right >= left ? 'right' : 'left';
      const count = direction === 'right' ? right : left;
      const seed = this.readBlock(b.top, b.left, b.bottom, b.right);
      const produced = fillRegion(seed, direction, count);
      const baseCol = direction === 'right' ? b.right + 1 : b.left - count;
      this.writeBlock(produced, b.top, baseCol);
      if (direction === 'right') {
        this.selection.setActive({ row: b.top, col: b.left });
        this.selection.extendTo({ row: b.bottom, col: b.right + count });
      } else {
        this.selection.setActive({ row: b.bottom, col: b.right });
        this.selection.extendTo({ row: b.top, col: b.left - count });
      }
    }
    this.emitter.emit('change', undefined);
  }

  private readBlock(top: number, left: number, bottom: number, right: number): CellValue[][] {
    const out: CellValue[][] = [];
    for (let row = top; row <= bottom; row++) {
      const line: CellValue[] = [];
      for (let col = left; col <= right; col++) {
        line.push(this.getValue(row, col) as CellValue);
      }
      out.push(line);
    }
    return out;
  }

  private writeBlock(block: readonly (readonly CellValue[])[], baseRow: number, baseCol: number): void {
    const toRaw = (v: CellValue): string =>
      v === null ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v);
    this.undo.transaction(() => {
      block.forEach((line, r) => {
        line.forEach((value, c) => {
          const row = baseRow + r;
          const col = baseCol + c;
          // fillTo only ever produces non-negative bases, so only the upper
          // grid bound can be exceeded.
          if (row < this.getRowCount() && col < this.getColCount()) {
            this.undo.execute(this.setContentCommand(this.toPhysical(row, col), toRaw(value)));
          }
        });
      });
    }, 'fill');
  }

  /** Extract the selection bounding box as a matrix of edit text (for copy). */
  copySelection(): string[][] {
    const bounds = normalizeRange(this.selection.getSelectionBounds());
    const out: string[][] = [];
    for (let row = bounds.top; row <= bounds.bottom; row++) {
      const line: string[] = [];
      for (let col = bounds.left; col <= bounds.right; col++) {
        line.push(this.getEditText(row, col));
      }
      out.push(line);
    }
    return out;
  }

  undoLast(): void {
    if (this.undo.undo()) {
      this.emitter.emit('change', undefined);
    }
  }
  redoLast(): void {
    if (this.undo.redo()) {
      this.emitter.emit('change', undefined);
    }
  }

  // ── Edit lifecycle ────────────────────────────────────────────────────────
  getEdit(): EditState | null {
    return this.editState;
  }

  beginEdit(row: number, col: number, initial?: string): void {
    this.editState = {
      row,
      col,
      draft: initial ?? this.getEditText(row, col),
    };
    this.emitter.emit('edit', this.editState);
  }

  updateDraft(draft: string): void {
    if (this.editState !== null) {
      this.editState = { ...this.editState, draft };
    }
  }

  commitEdit(): void {
    if (this.editState === null) {
      return;
    }
    const { row, col, draft } = this.editState;
    this.editState = null;
    this.setCellText(row, col, draft);
    // Validate the committed value against the column/cell validator (if any).
    const p = this.toPhysical(row, col);
    void this.validation.validate(p.row, p.col, this.parseInput(draft) as CellValue);
    this.emitter.emit('edit', null);
  }

  cancelEdit(): void {
    if (this.editState === null) {
      return;
    }
    this.editState = null;
    this.emitter.emit('edit', null);
  }

  // ── Sizing (visual index → physical, then refresh visible sizes) ───────────
  resizeRow(row: number, height: number): void {
    this.rowSizes.setSize(this.view.rows.getPhysicalIndex(row), height);
    this.rebuildViewSizes();
    this.emitter.emit('change', undefined);
  }
  resizeCol(col: number, width: number): void {
    this.colSizes.setSize(this.view.cols.getPhysicalIndex(col), width);
    this.rebuildViewSizes();
    this.emitter.emit('change', undefined);
  }
}
