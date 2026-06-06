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
  type SortDirection,
  type FilterCondition,
} from '@lattica/data';
import { SheetEngine, FormulaError, type CellContent } from '@lattica/formula';
import type { GridGeometry } from './geometry.js';
import type { CellAlign } from './cell-types.js';

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
  /** View transform (sort/filter) mapping visual↔physical indices. */
  readonly view: DataView;
  private readonly sortModel = new SortModel();
  private readonly filterModel = new FilterModel();
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

  /** Re-apply the current sort + filter, refresh sizes/selection, and emit. */
  private refreshView(): void {
    this.view.applyFilter(this.engineGet, this.filterModel.getFilters());
    this.view.applySort(this.engineGet, this.sortModel.getConfigs());
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

  // ── Conditional formatting & search styling ────────────────────────────────
  /** Combined per-cell style: conditional-format rule, overlaid by a search-hit tint. */
  getCellStyle(row: number, col: number): CfStyle | null {
    const base = this.conditionalFormat.styleFor(
      this.engine.getValue(this.toPhysical(row, col)) as never,
    );
    if (this.searchKeys.has(`${row},${col}`)) {
      return { ...(base ?? {}), background: '#fff3a3' };
    }
    return base;
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
