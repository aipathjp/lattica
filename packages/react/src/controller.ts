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
  DetailModel,
  CommentModel,
  validators,
  aggregate,
  distinctValues,
  formatNumber,
  computeCellVisual,
  computeSparkline,
  type CfVisualRule,
  type CellVisual,
  type IconSet,
  type SparklineKind,
  type SparklineShape,
  type AggregateFn,
  type Validator,
  type MergeArea,
  type Command,
  type CellAddress,
  type CfStyle,
  type SearchOptions,
  type CellValue,
  type FillDirection,
  type GridStateSnapshot,
  forEachCell,
  normalizeRange,
  fillRegion,
  toA1,
  parseA1,
  computeSummaryCell,
  type ColumnDef,
  type SummaryRowSpec,
} from '@ai-path/tb-core';
import {
  DataView,
  SortModel,
  FilterModel,
  NestedRowModel,
  filteredHiddenRows,
  type SortDirection,
  type FilterCondition,
  type NestedRowNode,
} from '@ai-path/tb-data';
import { SheetEngine, FormulaError, type CellContent } from '@ai-path/tb-formula';
import type { GridGeometry } from './geometry.js';
import type { CellAlign } from './cell-types.js';
import { editorKindForType, type EditorKind } from './editors.js';
import {
  normalizeFlexibleTimeInput,
  normalizeTimeInput,
  sanitizeFlexibleTimeDraft,
  sanitizeTimeDraft,
  type TimeInputOptions,
} from './time-input.js';
import { formatElapsedDisplay, normalizeElapsedInput, sanitizeElapsedDraft } from './elapsed-time.js';
import { autoRowHeight, type MeasureText } from './measure.js';
import { hasFullWidthNumeric, normalizeFullWidth, type FullWidthMode } from './input-normalize.js';
import type { EnterMoves } from './keyboard.js';

export interface GridControllerOptions {
  rowCount: number;
  colCount: number;
  defaultRowHeight?: number;
  defaultColWidth?: number;
  rowHeaderWidth?: number;
  colHeaderHeight?: number;
  frozenRows?: number;
  frozenCols?: number;
  /**
   * Direction Enter moves the active cell (navigation and post-commit).
   * Shift+Enter moves the opposite way. Default `{ row: 1, col: 0 }` (down);
   * `{ row: 0, col: 1 }` gives Excel-style rightward entry.
   */
  enterMoves?: EnterMoves;
  /**
   * When true, a plain Enter on a cell begins editing instead of moving.
   * Default false (Enter only moves — the historical behavior).
   */
  enterBeginsEditing?: boolean;
  /**
   * When false, Tab is not handled by the grid, so the browser's default
   * focus navigation applies. Default true (Tab moves within the grid).
   */
  tabNavigation?: boolean;
  /**
   * When true (default), clicking outside the grid hides the selection
   * visuals until the grid is interacted with again. Set false to keep the
   * selection highlighted while other UI (e.g. a toolbar) is used.
   */
  outsideClickDeselects?: boolean;
  /**
   * View-only mode: selection is neither drawn nor mutable through the UI,
   * and UI-initiated editing is blocked. Programmatic APIs (selection,
   * copySelection, setCellText, …) keep working. Default false.
   */
  selectionDisabled?: boolean;
}

export interface EditState {
  row: number;
  col: number;
  draft: string;
}

/** Options for {@link GridController.autoSizeRows} (wrap-aware row heights). */
export interface AutoSizeRowsOptions {
  /** Text measurer, e.g. `canvasMeasurer(ctx)` or a deterministic mock. */
  measure: MeasureText;
  /** CSS font the cells are painted with, e.g. `13px system-ui`. */
  font: string;
  /** Line height in px — use `wrapLineHeight(theme.fontSize)` to match paint. */
  lineHeight: number;
  /** Horizontal cell padding per side (default 6, the theme default). */
  paddingX?: number;
  /** Vertical padding added to the wrapped block height (default 6). */
  paddingY?: number;
  /** Minimum row height; defaults to the controller's default row height. */
  minHeight?: number;
  /** Visual rows to size; every visible row when omitted. */
  rows?: readonly number[];
}

export interface CellChange {
  row: number;
  col: number;
  physicalRow: number;
  physicalCol: number;
  prev: string;
  next: string;
}

/**
 * Source of a {@link CellCommitEvent}. Built-in interactions emit the literal
 * kinds; programmatic writes ({@link GridController.setCellText} with a
 * `source` option) may carry any app-defined string (e.g. `'revert'`,
 * `'time-link'`) so a `cellcommit` handler can recognize — and ignore — its
 * own writes. The `(string & {})` member keeps literal autocompletion while
 * accepting arbitrary strings.
 */
export type CellCommitSource =
  | 'edit'
  | 'paste'
  | 'fill'
  | 'delete'
  | 'undo'
  | 'redo'
  | (string & {});

export interface CellCommitEvent {
  source: CellCommitSource;
  changes: CellChange[];
}

/** Options for {@link GridController.setCellText} (programmatic writes). */
export interface SetCellTextOptions {
  /**
   * Custom `cellcommit` source, propagated verbatim. When set, the write
   * emits a `cellcommit` event (only if the stored text actually changed) so
   * apps can distinguish their own programmatic writes from user edits —
   * e.g. a validation handler reverting to the previous value tags the
   * revert write and ignores it when it comes back, avoiding revert loops.
   * When omitted, no `cellcommit` is emitted (legacy behavior).
   */
  source?: string;
  /**
   * Write even when the target cell/column is read-only
   * ({@link GridController.isCellEditable} returns false). Default false —
   * a write to a read-only cell is a silent no-op. Use true for app-driven
   * transcription into protected cells (e.g. time-linked cells).
   */
  bypassReadOnly?: boolean;
  /**
   * Record the write in undo history (default true, the historical
   * behavior). `false` applies the content without touching the undo/redo
   * stacks — Ctrl+Z will not resurface the overwritten value.
   */
  undoable?: boolean;
}

export interface ColumnInputOptions {
  sanitizeDraft?: (draft: string, prev: string) => string;
  maxLength?: number;
  commitTransform?: (raw: string) => string | null;
}

export interface SetDataOptions {
  resize?: boolean;
}

/**
 * Display-only override hook. Called with the **physical** (data) cell
 * coordinates and the base display text (formatted value). Return a string to
 * replace the painted text for that cell, or null to keep the base display.
 * Stored values, edit text ({@link GridController.getEditText}) and copy
 * output are never affected — this changes presentation only.
 */
export type DisplayOverride = (
  physicalRow: number,
  physicalCol: number,
  baseDisplay: string,
) => string | null;

/**
 * Per-cell metadata returned by a {@link CellMetaProvider} (Handsontable
 * `cells()` 相当). Presentation fields (`background` / `color` / `fontWeight`)
 * are merged into the paint pipeline **above** conditional-format, search, and
 * validation styles but **below** the selection tint and the active-cell
 * border. `readOnly: true` is OR-composed with
 * {@link GridController.setCellReadOnly} and
 * {@link GridController.setColumnEditable} inside
 * {@link GridController.isCellEditable} — any of the three can lock a cell.
 */
export interface CellMeta {
  /** Cell background color (wins over conditional-format backgrounds). */
  background?: string;
  /** Cell text color (wins over conditional-format text colors). */
  color?: string;
  /** Font weight for the painted cell text. Default `'normal'`. */
  fontWeight?: 'bold' | 'normal';
  /** When true the cell is read-only regardless of column/cell editability. */
  readOnly?: boolean;
}

/**
 * Cell-meta provider. Called with **physical** (data) coordinates on every
 * scene build, so meta derived from external state (a pending-save Map, an
 * audit diff…) is re-read each frame — call
 * {@link GridController.refreshCellMeta} after mutating that state to force a
 * repaint. Return null for "no meta on this cell".
 */
export type CellMetaProvider = (physicalRow: number, physicalCol: number) => CellMeta | null;

/**
 * Per-column behavior options attached alongside the cell type via
 * {@link GridController.setColumnType}. Currently these tune the `time`
 * input pipeline; see {@link TimeInputOptions}.
 */
export type ColumnTypeOptions = TimeInputOptions;

/**
 * Emitted when an edit commit is refused: full-width input on a
 * `fullWidthMode: 'reject'` column, a `commitTransform` returning null for
 * non-empty input, or a column/cell validator failing after commit.
 */
export interface InputRejectEvent {
  /** Visual row of the edited cell. */
  row: number;
  /** Visual column of the edited cell. */
  col: number;
  /** The raw text whose commit was refused. */
  raw: string;
  reason: 'fullwidth' | 'transform' | 'validator';
}

/**
 * Emitted after {@link GridController.insertRow} / {@link GridController.removeRow}
 * (and their undo/redo) mutate the physical row set. `index` is the physical
 * row index of the insertion/removal point.
 */
export interface RowsChangeEvent {
  kind: 'insert' | 'remove';
  index: number;
  count: number;
}

interface ControllerEvents {
  change: void;
  edit: EditState | null;
  cellcommit: CellCommitEvent;
  viewstate: GridStateSnapshot;
  inputreject: InputRejectEvent;
  rowschange: RowsChangeEvent;
}

/**
 * Everything a physical row carries besides engine content, captured so a
 * removed row can be restored by a single undo step.
 */
interface RowSnapshot {
  /** Engine content (editable text / literal) per physical column. */
  cells: CellContent[];
  /** Row-height override, or null when the row uses the default height. */
  height: number | null;
  /** Physical columns whose cells were marked read-only on this row. */
  readOnlyCols: number[];
  /** In-cell sparklines attached to this row. */
  sparklines: { col: number; values: number[]; kind: SparklineKind }[];
  /** Comments attached to this row. */
  comments: { col: number; text: string }[];
  /** Whether the row's master/detail panel was expanded. */
  detailExpanded: boolean;
  /**
   * Exact merge list to restore (captured by remove so undo is lossless), or
   * null to shift existing merges positionally (fresh inserts).
   */
  merges: MergeArea[] | null;
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

function mapToRecord(map: ReadonlyMap<number, number>): Record<number, number> | undefined {
  if (map.size === 0) {
    return undefined;
  }
  const record: Record<number, number> = {};
  for (const [key, value] of map) {
    record[key] = value;
  }
  return record;
}

function nonEmptyArray<T>(items: T[]): T[] | undefined {
  return items.length === 0 ? undefined : items;
}

function isIdentityOrder(order: readonly number[]): boolean {
  return order.every((physical, visual) => physical === visual);
}

function validIndex(index: number, count: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < count;
}

function loadCellText(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  return String(value);
}

/** Coerce an arbitrary value to the raw text used for cell input. */
function rawCellText(value: unknown): string {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null ||
    value === undefined
  ) {
    return loadCellText(value);
  }
  return String(value);
}

/** Physical row of a `"row,col"` metadata key. */
function rowOfCellKey(key: string): number {
  return Number(key.slice(0, key.indexOf(',')));
}

function sparseOrder(order: readonly number[], count: number): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const index of order) {
    if (validIndex(index, count) && !seen.has(index)) {
      seen.add(index);
      out.push(index);
    }
  }
  for (let index = 0; index < count; index++) {
    if (!seen.has(index)) {
      out.push(index);
    }
  }
  return out;
}

// Optional sign, optional currency symbol, grouped or plain digits, optional
// decimals, optional trailing percent.
const FORMATTED_NUMBER = /^([-+]?)\s*[$¥€£]?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(%?)$/;

/**
 * Parse a user-typed value into a number, accepting plain numbers and common
 * human formats: thousands separators (`1,234`), a leading currency symbol
 * (`$1,000`, `¥500`), and a trailing percent (`50%` → 0.5). Returns null when
 * the text is not numeric, so callers keep it as text.
 */
export function parseNumberInput(raw: string): number | null {
  const t = raw.trim();
  if (t === '') {
    return null;
  }
  const plain = Number(t);
  if (Number.isFinite(plain)) {
    return plain;
  }
  const m = FORMATTED_NUMBER.exec(t);
  if (m === null) {
    return null;
  }
  // The regex guarantees a valid numeric string after stripping commas.
  let value = Number(m[2]!.replace(/,/g, ''));
  if (m[1] === '-') {
    value = -value;
  }
  if (m[3] === '%') {
    value /= 100;
  }
  return value;
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
  /** Cell comments (keyed by physical coords, like sparklines/validation). */
  readonly comments = new CommentModel();
  /** Master/detail expansion state (physical row keys). */
  readonly details = new DetailModel();
  /** Extra height reserved below an expanded master row for its detail panel. */
  private detailHeight = 120;
  /** Allowed option lists for dropdown/autocomplete columns (physical col). */
  private readonly columnOptions = new Map<number, readonly string[]>();
  /** Excel-style number format patterns per physical column. */
  private readonly columnFormats = new Map<number, string>();
  /** Visual conditional-format rules (color scale / data bar / icon set) per physical column. */
  private readonly columnVisualRules = new Map<number, CfVisualRule>();
  /** In-cell sparkline series per physical cell ("row,col"). */
  private readonly cellSparklines = new Map<string, { values: number[]; kind: SparklineKind }>();
  /** View transform (sort/filter) mapping visual↔physical indices. */
  readonly view: DataView;
  private readonly sortModel = new SortModel();
  private readonly filterModel = new FilterModel();
  private readonly nestedRows = new NestedRowModel([]);
  private readonly columnTypes = new Map<number, string>();
  /** Custom editor kind per physical column (consumed by the React view). */
  private readonly columnEditors = new Map<number, string>();
  private readonly columnTypeOptions = new Map<number, ColumnTypeOptions>();
  private readonly columnAligns = new Map<number, CellAlign>();
  /** Text-wrap flags per physical column (default off). */
  private readonly columnWraps = new Map<number, boolean>();
  /** Empty-cell placeholder hints per physical column (default none). */
  private readonly columnPlaceholders = new Map<number, string>();
  private readonly columnEditable = new Map<number, boolean>();
  private readonly cellReadOnly = new Set<string>();
  private readonly columnInputs = new Map<number, ColumnInputOptions>();
  private readonly columnInputsFromDefs = new Set<number>();
  /** Leaf column `field` → physical column, learned from column defs. */
  private readonly columnFields = new Map<string, number>();
  /** Pinned summary (footer) row specs, rendered below the body. */
  private summarySpecs: readonly SummaryRowSpec[] = [];
  /** Explicit full-width input policy overrides (physical col). */
  private readonly columnFullWidthModes = new Map<number, FullWidthMode>();
  private readonly searchKeys = new Set<string>();
  /** Display-only text override (audit snapshots, per-column formatting…). */
  private displayOverride: DisplayOverride | null = null;
  /** Per-cell meta provider (style + readOnly), keyed by physical coords. */
  private cellMetaProvider: CellMetaProvider | null = null;
  private readonly emitter = new Emitter<ControllerEvents>();
  private suppressChangeEvents = false;

  private rowCount: number;
  private colCount: number;
  private readonly defaultRowHeight: number;
  private readonly defaultColWidth: number;
  /** Visible-indexed sizes derived from the view; consumed by geometry(). */
  private viewRowSizes: SizeManager;
  private viewColSizes: SizeManager;
  readonly rowHeaderWidth: number;
  /** Base header height from options, before multi-line auto-expansion. */
  private readonly baseColHeaderHeight: number;
  /** Effective header height consumed by {@link geometry}. */
  private colHeaderHeightPx: number;
  frozenRows: number;
  frozenCols: number;
  /** Enter-key movement delta (see {@link GridControllerOptions.enterMoves}). */
  readonly enterMoves: EnterMoves;
  /** Whether a plain Enter begins editing instead of moving. */
  readonly enterBeginsEditing: boolean;
  /** Whether Tab navigates within the grid. */
  readonly tabNavigation: boolean;
  /** Whether clicking outside the grid hides the selection visuals. */
  readonly outsideClickDeselects: boolean;
  /** View-only mode: no selection visuals and no UI selection/edit operations. */
  readonly selectionDisabled: boolean;

  /** Effective column-header band height (px). See {@link getHeaderHeight}. */
  get colHeaderHeight(): number {
    return this.colHeaderHeightPx;
  }

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
    this.baseColHeaderHeight = options.colHeaderHeight ?? 24;
    this.colHeaderHeightPx = this.baseColHeaderHeight;
    this.frozenRows = options.frozenRows ?? 0;
    this.frozenCols = options.frozenCols ?? 0;
    this.enterMoves = options.enterMoves ?? { row: 1, col: 0 };
    this.enterBeginsEditing = options.enterBeginsEditing ?? false;
    this.tabNavigation = options.tabNavigation ?? true;
    this.outsideClickDeselects = options.outsideClickDeselects ?? true;
    this.selectionDisabled = options.selectionDisabled ?? false;
    this.selection.subscribe(() => {
      if (!this.suppressChangeEvents) {
        this.emitter.emit('change', undefined);
      }
    });
    // Repaint when the invalid-cell set changes (validation runs on commit).
    this.validation.subscribe(() => this.emitter.emit('change', undefined));
    // Repaint when comments change (corner marker + hover tooltip source).
    this.comments.subscribe(() => this.emitter.emit('change', undefined));
    // Expanding/collapsing a detail panel changes row heights.
    this.details.subscribe(() => {
      this.rebuildViewSizes();
      this.emitter.emit('change', undefined);
    });
  }

  private setSelectionDimensions(rowCount: number, colCount: number): void {
    this.suppressChangeEvents = true;
    try {
      this.selection.setDimensions(rowCount, colCount);
    } finally {
      this.suppressChangeEvents = false;
    }
  }

  getRowCount(): number {
    return this.view.getRowCount();
  }
  getColCount(): number {
    return this.view.getColCount();
  }

  private setPhysicalDimensions(rowCount: number, colCount: number, emit: boolean): void {
    if (rowCount < 0) {
      throw new RangeError(`rowCount must be >= 0, got ${rowCount}`);
    }
    if (colCount < 0) {
      throw new RangeError(`colCount must be >= 0, got ${colCount}`);
    }
    const prevRows = this.rowCount;
    const prevCols = this.colCount;
    if (rowCount === prevRows && colCount === prevCols) {
      return;
    }

    if (rowCount > prevRows) {
      this.view.rows.insert(prevRows, rowCount - prevRows);
    } else if (rowCount < prevRows) {
      const removed = Array.from({ length: prevRows - rowCount }, (_, i) => rowCount + i);
      this.view.rows.remove(removed);
    }
    if (colCount > prevCols) {
      this.view.cols.insert(prevCols, colCount - prevCols);
    } else if (colCount < prevCols) {
      const removed = Array.from({ length: prevCols - colCount }, (_, i) => colCount + i);
      this.view.cols.remove(removed);
    }

    this.rowCount = rowCount;
    this.colCount = colCount;
    this.rowSizes.setCount(rowCount);
    this.colSizes.setCount(colCount);
    this.rebuildViewSizes();
    this.setSelectionDimensions(this.view.getRowCount(), this.view.getColCount());
    if (emit) {
      this.emitter.emit('change', undefined);
    }
  }

  /** Set the physical row count. Engine content outside the view is retained. */
  setRowCount(rowCount: number): void {
    this.setPhysicalDimensions(rowCount, this.colCount, true);
  }

  /** Set the physical column count. Engine content outside the view is retained. */
  setColCount(colCount: number): void {
    this.setPhysicalDimensions(this.rowCount, colCount, true);
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
      const physical = this.view.rows.getPhysicalIndex(v);
      let size = this.rowSizes.getSize(physical);
      // Expanded master rows reserve extra height for their detail panel.
      if (this.details.isExpanded(physical)) {
        size += this.detailHeight;
      }
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
  private refreshView(emit = true): void {
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
    this.setSelectionDimensions(this.view.getRowCount(), this.view.getColCount());
    if (emit) {
      this.emitter.emit('change', undefined);
    }
  }

  /** Toggle the sort on a (visual) column: none→asc→desc→none. */
  toggleSort(visualCol: number, additive = false): void {
    this.sortModel.toggle(this.view.cols.getPhysicalIndex(visualCol), additive);
    this.refreshView();
    this.emitViewState();
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
    this.emitViewState();
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
    this.setSelectionDimensions(this.view.getRowCount(), this.view.getColCount());
    this.emitter.emit('change', undefined);
  }

  /** Hide a (visual) column. */
  hideColumn(visualCol: number): void {
    this.view.cols.setHidden([this.view.cols.getPhysicalIndex(visualCol)], true);
    this.refreshColumns();
    this.emitViewState();
  }

  /** Show a previously-hidden (physical) column. */
  showColumn(physicalCol: number): void {
    this.view.cols.setHidden([physicalCol], false);
    this.refreshColumns();
    this.emitViewState();
  }

  /** Is the given physical column currently hidden? */
  isColumnHidden(physicalCol: number): boolean {
    return this.view.cols.isHidden(physicalCol);
  }

  /** Reveal every hidden column. */
  showAllColumns(): void {
    this.view.cols.setHidden(this.view.cols.getHidden(), false);
    this.refreshColumns();
    this.emitViewState();
  }

  /** Set visibility for a physical column. Out-of-range columns are ignored. */
  setColumnVisible(physicalCol: number, visible: boolean): void {
    if (!validIndex(physicalCol, this.colCount)) {
      return;
    }
    this.view.cols.setHidden([physicalCol], !visible);
    this.refreshColumns();
    this.emitViewState();
  }

  // ── Master / detail ────────────────────────────────────────────────────────
  /** Extra height reserved below an expanded master row (default 120). */
  setDetailHeight(height: number): void {
    this.detailHeight = Math.max(0, height);
    this.rebuildViewSizes();
    this.emitter.emit('change', undefined);
  }

  getDetailHeight(): number {
    return this.detailHeight;
  }

  /** Toggle the detail panel of a (visual) row. */
  toggleDetail(visualRow: number): void {
    this.details.toggle(this.view.rows.getPhysicalIndex(visualRow));
  }

  /** Is the (visual) row's detail panel expanded? */
  isDetailExpanded(visualRow: number): boolean {
    return this.details.isExpanded(this.view.rows.getPhysicalIndex(visualRow));
  }

  /** Physical (data) row index for a visual row. */
  getPhysicalRow(visualRow: number): number {
    return this.view.rows.getPhysicalIndex(visualRow);
  }

  /** Physical (data) column index for a visual column. */
  getPhysicalCol(visualCol: number): number {
    return this.view.cols.getPhysicalIndex(visualCol);
  }

  /** Current width of a visible column. */
  getColumnWidth(visualCol: number): number {
    return this.viewColSizes.getSize(visualCol);
  }

  /** Widths (px) of every visible column, in visual order — indexable by visual column. */
  getColumnWidths(): number[] {
    const widths: number[] = [];
    for (let col = 0; col < this.viewColSizes.getCount(); col++) {
      widths.push(this.viewColSizes.getSize(col));
    }
    return widths;
  }

  /** Current height of a visible row. */
  getRowHeight(visualRow: number): number {
    return this.viewRowSizes.getSize(visualRow);
  }

  // ── Formula bar support ────────────────────────────────────────────────────
  /** The active (visual) cell. */
  getActiveCell(): { row: number; col: number } {
    const { active } = this.selection.getState();
    return { row: active.row, col: active.col };
  }

  /** A1 reference of the active cell (physical coords, matching formulas). */
  getActiveRef(): string {
    const { active } = this.selection.getState();
    return toA1(this.toPhysical(active.row, active.col));
  }

  /** Editable text (`=formula` or literal) of the active cell. */
  getActiveEditText(): string {
    const { active } = this.selection.getState();
    return this.getEditText(active.row, active.col);
  }

  /** Set the active cell's content (undoable) — used by the formula bar. */
  setActiveCellText(raw: string): void {
    const { active } = this.selection.getState();
    this.setCellText(active.row, active.col, raw);
  }

  /**
   * Select the cell named by an A1 reference (physical), e.g. from the name box.
   * Returns false for an invalid or out-of-range / hidden reference.
   */
  goToRef(ref: string): boolean {
    let addr: { row: number; col: number };
    try {
      addr = parseA1(ref);
    } catch {
      return false;
    }
    if (addr.row >= this.rowCount || addr.col >= this.colCount) {
      return false;
    }
    const visualRow = this.view.rows.getVisualIndex(addr.row);
    const visualCol = this.view.cols.getVisualIndex(addr.col);
    if (visualRow < 0 || visualCol < 0) {
      return false; // hidden by filter / collapse
    }
    this.selection.setActive({ row: visualRow, col: visualCol });
    return true;
  }

  /** Move `count` columns from one visual position to another. */
  moveColumn(fromVisual: number, toVisual: number, count = 1): void {
    this.view.cols.move(fromVisual, count, toVisual);
    this.refreshColumns();
    this.emitViewState();
  }

  /** Snapshot the current user-customizable view state. */
  captureViewState(): GridStateSnapshot {
    const columnOrder = this.view.cols.getOrder();
    const sort = this.sortModel.getConfigs();
    const snapshot: GridStateSnapshot = { version: 1 };
    const columnWidths = mapToRecord(this.colSizes.getOverrides());
    const rowHeights = mapToRecord(this.rowSizes.getOverrides());
    if (columnWidths !== undefined) snapshot.columnWidths = columnWidths;
    if (rowHeights !== undefined) snapshot.rowHeights = rowHeights;
    const hiddenColumns = nonEmptyArray(this.view.cols.getHidden());
    const hiddenRows = nonEmptyArray(this.view.rows.getHidden());
    if (hiddenColumns !== undefined) snapshot.hiddenColumns = hiddenColumns;
    if (hiddenRows !== undefined) snapshot.hiddenRows = hiddenRows;
    if (!isIdentityOrder(columnOrder)) snapshot.columnOrder = columnOrder;
    if (sort.length > 0) snapshot.sort = sort;
    if (this.frozenRows !== 0) snapshot.frozenRows = this.frozenRows;
    if (this.frozenCols !== 0) snapshot.frozenCols = this.frozenCols;
    return snapshot;
  }

  /** Apply a captured view state. Out-of-range entries are ignored. */
  applyViewState(snapshot: GridStateSnapshot): void {
    if (snapshot.columnWidths !== undefined) {
      for (const col of this.colSizes.getOverrides().keys()) {
        this.colSizes.resetSize(col);
      }
      for (const [key, size] of Object.entries(snapshot.columnWidths)) {
        const col = Number(key);
        if (validIndex(col, this.colCount)) {
          this.colSizes.setSize(col, size);
        }
      }
    }
    if (snapshot.rowHeights !== undefined) {
      for (const row of this.rowSizes.getOverrides().keys()) {
        this.rowSizes.resetSize(row);
      }
      for (const [key, size] of Object.entries(snapshot.rowHeights)) {
        const row = Number(key);
        if (validIndex(row, this.rowCount)) {
          this.rowSizes.setSize(row, size);
        }
      }
    }

    if (snapshot.hiddenColumns !== undefined) {
      this.view.cols.setHidden(this.view.cols.getHidden(), false);
      this.view.cols.setHidden(snapshot.hiddenColumns.filter((col) => validIndex(col, this.colCount)), true);
    }
    if (snapshot.hiddenRows !== undefined) {
      this.view.rows.setHidden(this.view.rows.getHidden(), false);
      this.view.rows.setHidden(snapshot.hiddenRows.filter((row) => validIndex(row, this.rowCount)), true);
    }

    if (snapshot.columnOrder !== undefined) {
      this.view.cols.setOrder(sparseOrder(snapshot.columnOrder, this.colCount));
    }

    if (snapshot.sort !== undefined) {
      const sort = snapshot.sort.filter((config) => validIndex(config.col, this.colCount));
      this.sortModel.setConfigs(sort);
      this.view.applySort(this.engineGet, sort);
    }

    if (snapshot.frozenRows !== undefined) {
      this.frozenRows = Math.max(0, Math.min(snapshot.frozenRows, this.rowCount));
    }
    if (snapshot.frozenCols !== undefined) {
      this.frozenCols = Math.max(0, Math.min(snapshot.frozenCols, this.colCount));
    }

    this.rebuildViewSizes();
    this.setSelectionDimensions(this.view.getRowCount(), this.view.getColCount());
    this.emitter.emit('change', undefined);
  }

  private emitViewState(): void {
    this.emitter.emit('viewstate', this.captureViewState());
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

  /** Values of a (visual) column over the currently visible rows. */
  private visibleColumnValues(visualCol: number): CellValue[] {
    const rows = this.getRowCount();
    const values: CellValue[] = [];
    for (let r = 0; r < rows; r++) {
      const p = this.toPhysical(r, visualCol);
      values.push(this.engine.getValue(p) as CellValue);
    }
    return values;
  }

  /** Aggregate a (visual) column over the currently visible rows. */
  aggregateColumn(visualCol: number, fn: AggregateFn): number | null {
    return aggregate(this.visibleColumnValues(visualCol), fn);
  }

  // ── Pinned summary (footer) rows ───────────────────────────────────────────
  /** Replace the pinned summary rows. `null` (or an empty list) removes them. */
  setSummaryRows(rows: readonly SummaryRowSpec[] | null): void {
    this.summarySpecs = rows ?? [];
    this.emitter.emit('change', undefined);
  }

  /** Current pinned summary row specs. */
  getSummaryRows(): readonly SummaryRowSpec[] {
    return this.summarySpecs;
  }

  /** Number of pinned summary rows. */
  getSummaryRowCount(): number {
    return this.summarySpecs.length;
  }

  /**
   * Resolve a summary-cell key — a physical column index (number or numeric
   * string) or a leaf column `field` name — to a physical column, or null.
   */
  private resolveSummaryKey(key: string | number): number | null {
    if (typeof key === 'number') {
      return validIndex(key, this.colCount) ? key : null;
    }
    if (/^\d+$/.test(key)) {
      const col = Number(key);
      return validIndex(col, this.colCount) ? col : null;
    }
    return this.columnFields.get(key) ?? null;
  }

  /**
   * Display text of a pinned summary cell. Aggregates run over the visible
   * (filter-applied) rows of the (visual) column, so they track edits, sort,
   * and filter changes automatically; built-in aggregates apply the column's
   * number format. The row label renders in its label column (default: the
   * first visible column) when that column carries no aggregation rule.
   */
  getSummaryDisplay(summaryRow: number, visualCol: number): string {
    const spec = this.summarySpecs[summaryRow];
    if (spec === undefined) {
      return '';
    }
    const physicalCol = this.view.cols.getPhysicalIndex(visualCol);
    for (const [key, rule] of Object.entries(spec.cells)) {
      if (this.resolveSummaryKey(key) !== physicalCol) {
        continue;
      }
      return computeSummaryCell(
        this.visibleColumnValues(visualCol),
        rule,
        typeof rule === 'string' ? this.columnFormats.get(physicalCol) : undefined,
      );
    }
    if (spec.label !== undefined) {
      const labelCol = spec.labelCol === undefined ? null : this.resolveSummaryKey(spec.labelCol);
      if (labelCol === null ? visualCol === 0 : labelCol === physicalCol) {
        return spec.label;
      }
    }
    return '';
  }

  /** Collect the raw values inside the current selection bounding box. */
  private selectionValues(): CellValue[] {
    const b = normalizeRange(this.selection.getSelectionBounds());
    const values: CellValue[] = [];
    for (let r = b.top; r <= b.bottom; r++) {
      for (let c = b.left; c <= b.right; c++) {
        values.push(this.engine.getValue(this.toPhysical(r, c)) as CellValue);
      }
    }
    return values;
  }

  /** Aggregate over the current selection bounding box. */
  aggregateSelection(fn: AggregateFn): number | null {
    return aggregate(this.selectionValues(), fn);
  }

  /** Summary of the current selection for a status bar (count/sum/avg/min/max). */
  selectionSummary(): { count: number; sum: number | null; avg: number | null; min: number | null; max: number | null } {
    const values = this.selectionValues();
    return {
      // `count` never returns null (it tallies non-empty cells, always a number).
      count: aggregate(values, 'count')!,
      sum: aggregate(values, 'sum'),
      avg: aggregate(values, 'avg'),
      min: aggregate(values, 'min'),
      max: aggregate(values, 'max'),
    };
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

  // ── Cell comments (visual coordinates in, stored by physical cell) ─────────
  /**
   * Attach a comment to a (visual) cell. Empty or whitespace-only text removes
   * any existing comment. Triggers a repaint via the comment subscription.
   */
  setComment(visualRow: number, visualCol: number, text: string): void {
    const p = this.toPhysical(visualRow, visualCol);
    this.comments.set(p.row, p.col, text);
  }

  /** The comment text of a (visual) cell, or null when none. */
  getComment(visualRow: number, visualCol: number): string | null {
    const p = this.toPhysical(visualRow, visualCol);
    return this.comments.get(p.row, p.col);
  }

  /** Remove the comment of a (visual) cell. Returns whether one was removed. */
  deleteComment(visualRow: number, visualCol: number): boolean {
    const p = this.toPhysical(visualRow, visualCol);
    return this.comments.remove(p.row, p.col);
  }

  /** Whether the (visual) cell has a comment attached. */
  hasComment(visualRow: number, visualCol: number): boolean {
    const p = this.toPhysical(visualRow, visualCol);
    return this.comments.has(p.row, p.col);
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

  /**
   * Effective total header height in px. When `<LatticaGrid>` renders columns
   * with multi-line labels it auto-expands the header band and syncs the value
   * here, so external strip UIs can align against the grid body's top edge.
   */
  getHeaderHeight(): number {
    return this.colHeaderHeightPx;
  }

  /** The `colHeaderHeight` option value, before multi-line auto-expansion. */
  getBaseHeaderHeight(): number {
    return this.baseColHeaderHeight;
  }

  /** Set the effective total header height (px). Emits `change` when it moves. */
  setHeaderHeight(px: number): void {
    if (px === this.colHeaderHeightPx) {
      return;
    }
    this.colHeaderHeightPx = px;
    this.emitter.emit('change', undefined);
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
      summaryRows: this.summarySpecs.length,
      summaryRowHeight: this.defaultRowHeight,
    };
  }

  /**
   * Display text of a cell (computed value, formatted). When a display
   * override is set and returns a non-null string for the cell, that string
   * replaces the painted text; stored values, edit text, and copy output are
   * unaffected.
   */
  getDisplay(row: number, col: number): string {
    const p = this.toPhysical(row, col);
    const value = this.engine.getValue(p);
    const fmt = this.columnFormats.get(p.col);
    // Elapsed durations render as "HH:MM" / "d:HH:MM" while storing "H:MM".
    const base =
      fmt !== undefined && typeof value === 'number'
        ? formatNumber(value, fmt)
        : this.columnTypes.get(p.col) === 'elapsed' && typeof value === 'string'
          ? formatElapsedDisplay(value)
          : formatValue(value);
    if (this.displayOverride !== null) {
      const overridden = this.displayOverride(p.row, p.col, base);
      if (overridden !== null) {
        return overridden;
      }
    }
    return base;
  }

  /**
   * Set (or clear with `null`) the display-only text override. The override
   * receives **physical** (data) coordinates plus the base display text and
   * returns a replacement string, or null to keep the base display. Display
   * changes only — {@link getEditText} and {@link copySelection} are
   * untouched. Emits a change so the grid repaints immediately.
   */
  setDisplayOverride(fn: DisplayOverride | null): void {
    this.displayOverride = fn;
    this.emitter.emit('change', undefined);
  }

  /** The current display override, or null when none is set. */
  getDisplayOverride(): DisplayOverride | null {
    return this.displayOverride;
  }

  /**
   * Set (or clear with `null`) the per-cell meta provider (Handsontable
   * `cells()` 相当). The provider receives **physical** (data) coordinates and
   * is consulted on every scene build, so external state it reads is
   * re-applied each frame. Its `background`/`color`/`fontWeight` paint above
   * conditional formats and below the selection visuals; `readOnly` feeds
   * {@link isCellEditable}. Emits a change so the grid repaints immediately.
   */
  setCellMetaProvider(fn: CellMetaProvider | null): void {
    this.cellMetaProvider = fn;
    this.emitter.emit('change', undefined);
  }

  /** The current cell-meta provider, or null when none is set. */
  getCellMetaProvider(): CellMetaProvider | null {
    return this.cellMetaProvider;
  }

  /**
   * Meta for a (visual) cell from the current provider, or null when no
   * provider is set or the provider has no meta for the cell. Maps visual →
   * physical coordinates before calling the provider.
   */
  getCellMeta(visualRow: number, visualCol: number): CellMeta | null {
    if (this.cellMetaProvider === null) {
      return null;
    }
    const p = this.toPhysical(visualRow, visualCol);
    return this.cellMetaProvider(p.row, p.col);
  }

  /**
   * Force a repaint after external state consulted by the cell-meta provider
   * (e.g. a pending-save Map) changes. The provider itself is unchanged — the
   * next scene build simply re-reads it for every visible cell.
   */
  refreshCellMeta(): void {
    this.emitter.emit('change', undefined);
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

  private getPhysicalEditText(row: number, col: number): string {
    const content = this.engine.getContent({ row, col });
    return content === null ? '' : String(content);
  }

  private cellChange(row: number, col: number, prev: string, next: string): CellChange | null {
    if (prev === next) {
      return null;
    }
    const p = this.toPhysical(row, col);
    return { row, col, physicalRow: p.row, physicalCol: p.col, prev, next };
  }

  private emitCellCommit(source: CellCommitEvent['source'], changes: CellChange[]): void {
    if (changes.length > 0) {
      this.emitter.emit('cellcommit', { source, changes });
    }
  }

  private captureContent(): Map<string, string> {
    const snapshot = new Map<string, string>();
    for (let row = 0; row < this.rowCount; row++) {
      for (let col = 0; col < this.colCount; col++) {
        const text = this.getPhysicalEditText(row, col);
        if (text !== '') {
          snapshot.set(`${row},${col}`, text);
        }
      }
    }
    return snapshot;
  }

  private diffContent(before: ReadonlyMap<string, string>): CellChange[] {
    const changes: CellChange[] = [];
    for (let row = 0; row < this.rowCount; row++) {
      for (let col = 0; col < this.colCount; col++) {
        const key = `${row},${col}`;
        const prev = before.get(key) ?? '';
        const next = this.getPhysicalEditText(row, col);
        if (prev !== next) {
          const visualRow = this.view.rows.getVisualIndex(row);
          const visualCol = this.view.cols.getVisualIndex(col);
          changes.push({ row: visualRow, col: visualCol, physicalRow: row, physicalCol: col, prev, next });
        }
      }
    }
    return changes;
  }

  // ── Column type & alignment (keyed by physical column) ─────────────────────
  /**
   * Set a column's cell type. `options` tunes type-specific behavior (e.g.
   * `{ timeOrDecimalHours: true }` or `{ excelTimeSerial: true }` for `time`
   * columns); omitting it clears any previously-set options.
   */
  setColumnType(col: number, type: string, options?: ColumnTypeOptions): void {
    this.columnTypes.set(col, type);
    if (options === undefined) {
      this.columnTypeOptions.delete(col);
    } else {
      this.columnTypeOptions.set(col, options);
    }
    this.emitter.emit('change', undefined);
  }
  getColumnType(visualCol: number): string | undefined {
    return this.columnTypes.get(this.view.cols.getPhysicalIndex(visualCol));
  }
  /** Type options for a (visual) column, or undefined when none set. */
  getColumnTypeOptions(visualCol: number): ColumnTypeOptions | undefined {
    return this.columnTypeOptions.get(this.view.cols.getPhysicalIndex(visualCol));
  }
  setColumnAlign(col: number, align: CellAlign): void {
    this.columnAligns.set(col, align);
    this.emitter.emit('change', undefined);
  }
  getColumnAlign(visualCol: number): CellAlign | undefined {
    return this.columnAligns.get(this.view.cols.getPhysicalIndex(visualCol));
  }
  /** Enable/disable text wrapping for a physical column. */
  setColumnWrap(col: number, wrap: boolean): void {
    this.columnWraps.set(col, wrap);
    this.emitter.emit('change', undefined);
  }
  /** Whether a (visual) column wraps its cell text. Default false. */
  getColumnWrap(visualCol: number): boolean {
    return this.columnWraps.get(this.view.cols.getPhysicalIndex(visualCol)) ?? false;
  }
  /** True when at least one column has wrapping enabled (cheap early-out). */
  hasWrapColumns(): boolean {
    for (const wrap of this.columnWraps.values()) {
      if (wrap) {
        return true;
      }
    }
    return false;
  }

  /**
   * Set (or clear with `null`) the placeholder hint painted inside empty
   * cells of a physical column (e.g. `"0.00"` / `"00:00"` / `"YYYY-MM-DD"`).
   * Display-only: stored values, copy output, and edit text are unaffected.
   */
  setColumnPlaceholder(col: number, hint: string | null): void {
    if (hint === null) {
      this.columnPlaceholders.delete(col);
    } else {
      this.columnPlaceholders.set(col, hint);
    }
    this.emitter.emit('change', undefined);
  }
  /** Placeholder hint of a (visual) column, or undefined when none is set. */
  getColumnPlaceholder(visualCol: number): string | undefined {
    return this.columnPlaceholders.get(this.view.cols.getPhysicalIndex(visualCol));
  }
  /** True when at least one column has a placeholder hint (cheap early-out). */
  hasPlaceholderColumns(): boolean {
    return this.columnPlaceholders.size > 0;
  }

  setColumnEditable(visualCol: number, editable: boolean): void {
    this.columnEditable.set(this.view.cols.getPhysicalIndex(visualCol), editable);
    this.emitter.emit('change', undefined);
  }

  /** Apply rich physical column definitions as one non-viewstate update. */
  applyColumnDefs(defs: readonly ColumnDef[]): void {
    defs.forEach((def, physicalCol) => {
      if (!validIndex(physicalCol, this.colCount)) {
        return;
      }
      if (def.field !== undefined && def.field !== '') {
        this.columnFields.set(def.field, physicalCol);
      }
      if (def.width !== undefined) {
        this.colSizes.setSize(physicalCol, def.width);
      }
      if (def.type !== undefined) {
        this.columnTypes.set(physicalCol, def.type);
      }
      if (def.editor !== undefined) {
        this.columnEditors.set(physicalCol, def.editor);
      }
      if (def.align !== undefined) {
        this.columnAligns.set(physicalCol, def.align);
      }
      if (def.wrap !== undefined) {
        this.columnWraps.set(physicalCol, def.wrap);
      }
      if (def.placeholder !== undefined) {
        this.columnPlaceholders.set(physicalCol, def.placeholder);
      }
      if (def.format !== undefined) {
        this.columnFormats.set(physicalCol, def.format);
      }
      if (def.options !== undefined) {
        this.columnOptions.set(physicalCol, def.options);
        this.validation.setColumnValidator(physicalCol, validators.list(def.options));
      }
      if (def.editable !== undefined) {
        this.columnEditable.set(physicalCol, def.editable);
      }
      if (def.fullWidthMode !== undefined) {
        this.columnFullWidthModes.set(physicalCol, def.fullWidthMode);
      }
      if (
        def.maxLength !== undefined &&
        (!this.columnInputs.has(physicalCol) || this.columnInputsFromDefs.has(physicalCol))
      ) {
        this.columnInputs.set(physicalCol, { maxLength: def.maxLength });
        this.columnInputsFromDefs.add(physicalCol);
      }
    });
    this.rebuildViewSizes();
    this.emitter.emit('change', undefined);
  }

  setCellReadOnly(visualRow: number, visualCol: number, readOnly: boolean): void {
    const p = this.toPhysical(visualRow, visualCol);
    const key = `${p.row},${p.col}`;
    if (readOnly) {
      this.cellReadOnly.add(key);
    } else {
      this.cellReadOnly.delete(key);
    }
    this.emitter.emit('change', undefined);
  }

  isCellEditable(visualRow: number, visualCol: number): boolean {
    const p = this.toPhysical(visualRow, visualCol);
    if (this.cellReadOnly.has(`${p.row},${p.col}`)) {
      return false;
    }
    // Cell-meta readOnly OR-composes with setCellReadOnly / setColumnEditable:
    // any of the three locks the cell.
    if (this.cellMetaProvider !== null && this.cellMetaProvider(p.row, p.col)?.readOnly === true) {
      return false;
    }
    return this.columnEditable.get(p.col) ?? true;
  }

  setColumnInput(visualCol: number, options: ColumnInputOptions | null): void {
    const physicalCol = this.view.cols.getPhysicalIndex(visualCol);
    this.columnInputsFromDefs.delete(physicalCol);
    if (options === null) {
      this.columnInputs.delete(physicalCol);
    } else {
      this.columnInputs.set(physicalCol, options);
    }
  }

  /**
   * Set (or clear with null) the full-width input policy of a (visual) column.
   * Only `number`/`time` columns consult the policy; their default is
   * `'normalize'`.
   */
  setColumnFullWidthMode(visualCol: number, mode: FullWidthMode | null): void {
    const physicalCol = this.view.cols.getPhysicalIndex(visualCol);
    if (mode === null) {
      this.columnFullWidthModes.delete(physicalCol);
    } else {
      this.columnFullWidthModes.set(physicalCol, mode);
    }
  }

  /**
   * Effective full-width policy applied on the commit path of a (visual)
   * column: `'off'` unless the column type is `number`/`time`, otherwise the
   * explicit override or the `'normalize'` default.
   */
  getColumnFullWidthMode(visualCol: number): FullWidthMode {
    const physicalCol = this.view.cols.getPhysicalIndex(visualCol);
    const type = this.columnTypes.get(physicalCol);
    if (type !== 'number' && type !== 'time') {
      return 'off';
    }
    return this.columnFullWidthModes.get(physicalCol) ?? 'normalize';
  }

  private inputOptionsFor(visualCol: number): ColumnInputOptions | undefined {
    const physicalCol = this.view.cols.getPhysicalIndex(visualCol);
    const explicit = this.columnInputs.get(physicalCol);
    if (explicit !== undefined) {
      return explicit;
    }
    const type = this.columnTypes.get(physicalCol);
    if (type === 'time') {
      const typeOptions = this.columnTypeOptions.get(physicalCol);
      if (typeOptions?.timeOrDecimalHours === true || typeOptions?.excelTimeSerial === true) {
        return {
          sanitizeDraft: sanitizeFlexibleTimeDraft,
          commitTransform: (raw) => normalizeFlexibleTimeInput(raw, typeOptions),
        };
      }
      return {
        sanitizeDraft: sanitizeTimeDraft,
        maxLength: 5,
        commitTransform: normalizeTimeInput,
      };
    }
    if (type === 'elapsed') {
      return {
        sanitizeDraft: sanitizeElapsedDraft,
        commitTransform: normalizeElapsedInput,
      };
    }
    return undefined;
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

  /**
   * Point a (physical) column at a custom editor kind registered in an
   * `EditorRegistry` (passed to `<LatticaGrid editors>`). Pass null to clear.
   * An unregistered kind silently falls back to the built-in text editor.
   */
  setColumnEditor(col: number, kind: string | null): void {
    if (kind === null) {
      this.columnEditors.delete(col);
    } else {
      this.columnEditors.set(col, kind);
    }
    this.emitter.emit('change', undefined);
  }

  /** Custom editor kind for a (visual) column, or undefined when none set. */
  getColumnEditor(visualCol: number): string | undefined {
    return this.columnEditors.get(this.view.cols.getPhysicalIndex(visualCol));
  }

  /** Set an Excel-style number format pattern for a (physical) column. */
  setColumnFormat(col: number, pattern: string): void {
    this.columnFormats.set(col, pattern);
    this.emitter.emit('change', undefined);
  }

  /** Number format pattern for a (visual) column, or undefined. */
  getColumnFormat(visualCol: number): string | undefined {
    return this.columnFormats.get(this.view.cols.getPhysicalIndex(visualCol));
  }

  // ── Visual conditional formatting (color scale / data bar / icon set) ───────
  /** Apply a 2/3-color color scale to a (physical) column. */
  setColorScale(col: number, colors: string[]): void {
    this.columnVisualRules.set(col, { kind: 'colorScale', colors });
    this.emitter.emit('change', undefined);
  }

  /** Apply in-cell data bars to a (physical) column. */
  setDataBar(col: number, color: string): void {
    this.columnVisualRules.set(col, { kind: 'dataBar', color });
    this.emitter.emit('change', undefined);
  }

  /** Apply a named Excel-style icon set (low→high) to a (physical) column. */
  setIconSet(col: number, set: IconSet): void {
    this.columnVisualRules.set(col, { kind: 'iconSet', set });
    this.emitter.emit('change', undefined);
  }

  /** Remove any visual conditional format from a (physical) column. */
  clearColumnVisual(col: number): void {
    if (this.columnVisualRules.delete(col)) {
      this.emitter.emit('change', undefined);
    }
  }

  /** Attach an in-cell sparkline series to a (physical) cell. */
  setCellSparkline(row: number, col: number, values: number[], kind: SparklineKind = 'line'): void {
    this.cellSparklines.set(`${row},${col}`, { values, kind });
    this.emitter.emit('change', undefined);
  }

  /** Compute the drawable sparkline for a (visual) cell at the given size, or null. */
  getCellSparkline(visualRow: number, visualCol: number, width: number, height: number): SparklineShape | null {
    const p = this.toPhysical(visualRow, visualCol);
    const spec = this.cellSparklines.get(`${p.row},${p.col}`);
    if (spec === undefined) {
      return null;
    }
    return computeSparkline(spec.values, width, height, spec.kind);
  }

  /**
   * Compute the drawable visual (background / bar / icon) for a (visual) cell,
   * or null when the column has no visual rule or the value is non-numeric. The
   * domain is the numeric min/max of the column over all physical rows.
   */
  getCellVisual(visualRow: number, visualCol: number): CellVisual | null {
    const pcol = this.view.cols.getPhysicalIndex(visualCol);
    const rule = this.columnVisualRules.get(pcol);
    if (rule === undefined) {
      return null;
    }
    let min = Infinity;
    let max = -Infinity;
    let any = false;
    for (let r = 0; r < this.view.rows.length; r++) {
      const v = this.engine.getValue({ row: r, col: pcol });
      if (typeof v === 'number' && Number.isFinite(v)) {
        any = true;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (!any) {
      return null;
    }
    const value = this.engine.getValue(this.toPhysical(visualRow, visualCol));
    return computeCellVisual(value as CellValue, min, max, rule);
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
    if (raw === 'TRUE' || raw === 'FALSE') {
      return raw === 'TRUE';
    }
    // Numbers — including human-formatted input ("1,234", "$1,000", "50%") —
    // are stored as numbers so column formats apply and aggregates work.
    const num = parseNumberInput(raw);
    if (num !== null) {
      return num;
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

  /**
   * Replace grid data from physical (0,0). Data loads are not user edits:
   * undo history is cleared and no cellcommit event is emitted.
   */
  setData(
    matrix: ReadonlyArray<ReadonlyArray<string | number | boolean | null>>,
    opts: SetDataOptions = {},
  ): void {
    const shouldResize = opts.resize ?? true;
    const nextRows = matrix.length;
    const nextCols = matrix.reduce((max, row) => Math.max(max, row.length), 0);
    if (shouldResize) {
      this.setPhysicalDimensions(nextRows, nextCols, false);
    }

    const rows = this.rowCount;
    const cols = this.colCount;
    for (let row = 0; row < rows; row++) {
      const source = matrix[row];
      for (let col = 0; col < cols; col++) {
        const raw = source === undefined || col >= source.length ? '' : loadCellText(source[col]);
        this.engine.setContent({ row, col }, this.parseInput(raw));
      }
    }
    this.undo.clear();
    this.refreshView(false);
    this.emitter.emit('change', undefined);
  }

  /** Replace grid data from record objects using the provided field order. */
  setRecords(
    records: ReadonlyArray<object>,
    fields: readonly string[],
    opts: SetDataOptions = {},
  ): void {
    // Learn the field → physical-column mapping so Record-shaped values
    // (insertRow, summary-row keys) resolve without separate column defs.
    fields.forEach((field, physicalCol) => {
      if (field !== '') {
        this.columnFields.set(field, physicalCol);
      }
    });
    this.setData(
      records.map((record) =>
        fields.map((field) => {
          const value = (record as Record<string, unknown>)[field];
          if (
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean' ||
            value === null ||
            value === undefined
          ) {
            return value ?? null;
          }
          return String(value);
        }),
      ),
      opts,
    );
  }

  /**
   * Set a single cell's content and emit a change. Undoable by default.
   * Writes to read-only cells/columns are silent no-ops unless
   * `bypassReadOnly` is set. With a `source` option the write also emits a
   * `cellcommit` carrying that source (see {@link SetCellTextOptions}).
   */
  setCellText(row: number, col: number, raw: string, options?: SetCellTextOptions): void {
    if (options?.bypassReadOnly !== true && !this.isCellEditable(row, col)) {
      return;
    }
    const p = this.toPhysical(row, col);
    const prev = options?.source === undefined ? '' : this.getPhysicalEditText(p.row, p.col);
    const command = this.setContentCommand(p, raw);
    if (options?.undoable === false) {
      command.apply();
    } else {
      this.undo.execute(command);
    }
    this.emitter.emit('change', undefined);
    if (options?.source !== undefined) {
      const change = this.cellChange(row, col, prev, this.getPhysicalEditText(p.row, p.col));
      this.emitCellCommit(options.source, change === null ? [] : [change]);
    }
  }

  // ── Imperative row insert / remove (physical indices, undoable) ────────────
  /**
   * Insert one row at **physical** index `index` (0…rowCount inclusive; the
   * upper bound appends). Existing rows at/after `index` shift down, together
   * with their row-keyed metadata (heights, read-only cells, comments,
   * sparklines, detail expansion, merges). `values` seeds the new row: an
   * array maps positionally onto physical columns; a record resolves keys via
   * the `field` mapping learned from {@link applyColumnDefs} / {@link setRecords}
   * (unknown fields are ignored). Omitted → an empty row.
   *
   * Undoable as one command. Emits `change` + `rowschange` (never
   * `cellcommit`); sort/filter are re-applied so the view is rebuilt.
   */
  insertRow(index: number, values?: readonly unknown[] | Record<string, unknown>): void {
    if (!Number.isInteger(index) || index < 0 || index > this.rowCount) {
      throw new RangeError(`insertRow index ${index} out of bounds [0, ${this.rowCount}]`);
    }
    const snapshot: RowSnapshot = {
      cells: this.rowValuesToCells(values),
      height: null,
      readOnlyCols: [],
      sparklines: [],
      comments: [],
      detailExpanded: false,
      merges: null,
    };
    this.undo.execute(this.makeInsertRowCommand(index, snapshot));
  }

  /**
   * Remove the row at **physical** index `index` (0…rowCount-1). Later rows
   * shift up together with their row-keyed metadata; a selection on or below
   * the removed row is clamped back into range. Undoable as one command — undo
   * restores the row's content and metadata (including the exact merge list).
   * Emits `change` + `rowschange` (never `cellcommit`).
   */
  removeRow(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.rowCount) {
      throw new RangeError(`removeRow index ${index} out of bounds [0, ${this.rowCount})`);
    }
    this.undo.execute(this.makeRemoveRowCommand(index));
  }

  /** Build the new row's engine contents from positional or field-keyed values. */
  private rowValuesToCells(values?: readonly unknown[] | Record<string, unknown>): CellContent[] {
    const cells: CellContent[] = new Array<CellContent>(this.colCount).fill(null);
    if (values === undefined) {
      return cells;
    }
    if (Array.isArray(values)) {
      const limit = Math.min(values.length, this.colCount);
      for (let col = 0; col < limit; col++) {
        cells[col] = this.parseInput(rawCellText(values[col]));
      }
      return cells;
    }
    for (const [field, value] of Object.entries(values)) {
      const col = this.columnFields.get(field);
      if (col !== undefined && validIndex(col, this.colCount)) {
        cells[col] = this.parseInput(rawCellText(value));
      }
    }
    return cells;
  }

  private makeInsertRowCommand(index: number, snapshot: RowSnapshot): Command {
    return {
      label: `insert row ${index}`,
      apply: () => this.performRowInsert(index, snapshot),
      invert: () => this.makeRemoveRowCommand(index),
    };
  }

  private makeRemoveRowCommand(index: number): Command {
    let captured: RowSnapshot | null = null;
    return {
      label: `remove row ${index}`,
      apply: () => {
        captured = this.performRowRemove(index);
      },
      invert: () =>
        // Commands are inverted only after apply() ran (see UndoManager), so
        // the snapshot is always captured by the time invert() is called.
        this.makeInsertRowCommand(index, captured!),
    };
  }

  /** Mutate the grid for a row insertion at physical `index`. */
  private performRowInsert(index: number, snapshot: RowSnapshot): void {
    // Grow the mapper (shifts sort order / filter hides) and the size axis.
    this.view.rows.insert(index, 1);
    this.rowCount += 1;
    this.rowSizes.setCount(this.rowCount);
    // Shift engine content down from the bottom so nothing is overwritten.
    for (let row = this.rowCount - 2; row >= index; row--) {
      for (let col = 0; col < this.colCount; col++) {
        this.engine.setContent({ row: row + 1, col }, this.engine.getContent({ row, col }));
      }
    }
    // Row-keyed metadata follows its rows, then the freed slot is populated.
    this.shiftRowMetadata(index, 1);
    if (snapshot.merges === null) {
      this.shiftMergesForInsert(index);
    } else {
      this.merges.clear();
      for (const area of snapshot.merges) {
        this.merges.add(area);
      }
    }
    for (let col = 0; col < this.colCount; col++) {
      this.engine.setContent({ row: index, col }, snapshot.cells[col] ?? null);
    }
    this.restoreRowMetadata(index, snapshot);
    this.refreshView(false);
    this.emitter.emit('change', undefined);
    this.emitter.emit('rowschange', { kind: 'insert', index, count: 1 });
  }

  /** Mutate the grid for a row removal at physical `index`; returns the snapshot. */
  private performRowRemove(index: number): RowSnapshot {
    const snapshot = this.captureRowSnapshot(index);
    this.clearRowMetadata(index);
    // Shift engine content up over the removed row, then clear the last row.
    for (let row = index + 1; row < this.rowCount; row++) {
      for (let col = 0; col < this.colCount; col++) {
        this.engine.setContent({ row: row - 1, col }, this.engine.getContent({ row, col }));
      }
    }
    for (let col = 0; col < this.colCount; col++) {
      this.engine.setContent({ row: this.rowCount - 1, col }, null);
    }
    this.shiftRowMetadata(index + 1, -1);
    this.shiftMergesForRemove(index);
    this.view.rows.remove([index]);
    this.rowCount -= 1;
    this.rowSizes.setCount(this.rowCount);
    if (this.frozenRows > this.rowCount) {
      this.frozenRows = this.rowCount;
    }
    this.refreshView(false);
    this.emitter.emit('change', undefined);
    this.emitter.emit('rowschange', { kind: 'remove', index, count: 1 });
    return snapshot;
  }

  /** Capture everything the physical row carries (for lossless undo). */
  private captureRowSnapshot(index: number): RowSnapshot {
    const cells: CellContent[] = [];
    for (let col = 0; col < this.colCount; col++) {
      cells.push(this.engine.getContent({ row: index, col }));
    }
    const readOnlyCols: number[] = [];
    for (const key of this.cellReadOnly) {
      if (rowOfCellKey(key) === index) {
        readOnlyCols.push(Number(key.slice(key.indexOf(',') + 1)));
      }
    }
    const sparklines: RowSnapshot['sparklines'] = [];
    for (const [key, spec] of this.cellSparklines) {
      if (rowOfCellKey(key) === index) {
        sparklines.push({ col: Number(key.slice(key.indexOf(',') + 1)), values: spec.values, kind: spec.kind });
      }
    }
    return {
      cells,
      height: this.rowSizes.getOverrides().get(index) ?? null,
      readOnlyCols,
      sparklines,
      comments: this.comments
        .list()
        .filter((c) => c.row === index)
        .map((c) => ({ col: c.col, text: c.text })),
      detailExpanded: this.details.isExpanded(index),
      merges: this.merges.list(),
    };
  }

  /** Drop all row-keyed metadata of the physical row being removed. */
  private clearRowMetadata(index: number): void {
    this.rowSizes.resetSize(index);
    for (const key of [...this.cellReadOnly]) {
      if (rowOfCellKey(key) === index) {
        this.cellReadOnly.delete(key);
      }
    }
    for (const key of [...this.cellSparklines.keys()]) {
      if (rowOfCellKey(key) === index) {
        this.cellSparklines.delete(key);
      }
    }
    for (const comment of this.comments.list()) {
      if (comment.row === index) {
        this.comments.remove(comment.row, comment.col);
      }
    }
    this.details.collapse(index);
  }

  /** Re-attach a snapshot's metadata to the (re-)inserted physical row. */
  private restoreRowMetadata(index: number, snapshot: RowSnapshot): void {
    if (snapshot.height !== null) {
      this.rowSizes.setSize(index, snapshot.height);
    }
    for (const col of snapshot.readOnlyCols) {
      this.cellReadOnly.add(`${index},${col}`);
    }
    for (const spark of snapshot.sparklines) {
      this.cellSparklines.set(`${index},${spark.col}`, { values: spark.values, kind: spark.kind });
    }
    for (const comment of snapshot.comments) {
      this.comments.set(index, comment.col, comment.text);
    }
    if (snapshot.detailExpanded) {
      this.details.expand(index);
    }
  }

  /**
   * Move row-keyed metadata (heights, read-only cells, sparklines, comments,
   * detail expansion) of every physical row >= `from` by `delta` rows. Entries
   * are removed first and re-added, so moves never collide.
   */
  private shiftRowMetadata(from: number, delta: number): void {
    const movedHeights: [number, number][] = [];
    for (const [row, size] of this.rowSizes.getOverrides()) {
      if (row >= from) {
        this.rowSizes.resetSize(row);
        movedHeights.push([row + delta, size]);
      }
    }
    for (const [row, size] of movedHeights) {
      this.rowSizes.setSize(row, size);
    }

    const movedReadOnly: string[] = [];
    for (const key of [...this.cellReadOnly]) {
      const row = rowOfCellKey(key);
      if (row >= from) {
        this.cellReadOnly.delete(key);
        movedReadOnly.push(`${row + delta}${key.slice(key.indexOf(','))}`);
      }
    }
    for (const key of movedReadOnly) {
      this.cellReadOnly.add(key);
    }

    const movedSparklines: [string, { values: number[]; kind: SparklineKind }][] = [];
    for (const [key, spec] of [...this.cellSparklines]) {
      const row = rowOfCellKey(key);
      if (row >= from) {
        this.cellSparklines.delete(key);
        movedSparklines.push([`${row + delta}${key.slice(key.indexOf(','))}`, spec]);
      }
    }
    for (const [key, spec] of movedSparklines) {
      this.cellSparklines.set(key, spec);
    }

    const movedComments = this.comments.list().filter((c) => c.row >= from);
    for (const comment of movedComments) {
      this.comments.remove(comment.row, comment.col);
    }
    for (const comment of movedComments) {
      this.comments.set(comment.row + delta, comment.col, comment.text);
    }

    const movedDetails = this.details.expandedRows().filter((row) => row >= from);
    for (const row of movedDetails) {
      this.details.collapse(row);
    }
    for (const row of movedDetails) {
      this.details.expand(row + delta);
    }
  }

  /**
   * Positionally shift merges for an insertion at row `index`: merges at/after
   * the row move down; merges spanning across it grow by one row. (Merges are
   * stored in visual coordinates, so this tracks rows only while the view is
   * the identity — see the row-ops docs.)
   */
  private shiftMergesForInsert(index: number): void {
    const areas = this.merges.list();
    if (areas.length === 0) {
      return;
    }
    this.merges.clear();
    for (const area of areas) {
      if (area.row >= index) {
        this.merges.add({ ...area, row: area.row + 1 });
      } else if (area.row + area.rowspan > index) {
        this.merges.add({ ...area, rowspan: area.rowspan + 1 });
      } else {
        this.merges.add(area);
      }
    }
  }

  /**
   * Positionally shift merges for a removal at row `index`: merges below move
   * up; merges spanning the row shrink by one; a single-row merge anchored on
   * the removed row is dropped.
   */
  private shiftMergesForRemove(index: number): void {
    const areas = this.merges.list();
    if (areas.length === 0) {
      return;
    }
    this.merges.clear();
    for (const area of areas) {
      if (area.row > index) {
        this.merges.add({ ...area, row: area.row - 1 });
      } else if (area.row + area.rowspan > index) {
        if (area.rowspan > 1) {
          this.merges.add({ ...area, rowspan: area.rowspan - 1 });
        }
      } else {
        this.merges.add(area);
      }
    }
  }

  /** Clear the currently selected cells (undoable batch). */
  deleteSelection(): void {
    const ranges = this.selection.getState().ranges;
    const changes: CellChange[] = [];
    this.undo.transaction(() => {
      for (const range of ranges) {
        forEachCell(range, (addr) => {
          const p = this.toPhysical(addr.row, addr.col);
          const prev = this.getPhysicalEditText(p.row, p.col);
          if (prev !== '') {
            this.undo.execute(this.setContentCommand(p, ''));
            const change = this.cellChange(addr.row, addr.col, prev, this.getPhysicalEditText(p.row, p.col));
            if (change !== null) changes.push(change);
          }
        });
      }
    }, 'delete');
    this.emitter.emit('change', undefined);
    this.emitCellCommit('delete', changes);
  }

  /** Paste a matrix of text starting at the active cell (undoable batch). */
  paste(matrix: ReadonlyArray<readonly string[]>): void {
    const { active } = this.selection.getState();
    const changes: CellChange[] = [];
    this.undo.transaction(() => {
      matrix.forEach((line, r) => {
        line.forEach((text, c) => {
          const row = active.row + r;
          const col = active.col + c;
          if (row < this.getRowCount() && col < this.getColCount()) {
            const p = this.toPhysical(row, col);
            const prev = this.getPhysicalEditText(p.row, p.col);
            this.undo.execute(this.setContentCommand(p, text));
            const change = this.cellChange(row, col, prev, this.getPhysicalEditText(p.row, p.col));
            if (change !== null) changes.push(change);
          }
        });
      });
    }, 'paste');
    this.emitter.emit('change', undefined);
    this.emitCellCommit('paste', changes);
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
      const changes = this.writeBlock(produced, baseRow, b.left);
      if (direction === 'down') {
        this.selection.setActive({ row: b.top, col: b.left });
        this.selection.extendTo({ row: b.bottom + count, col: b.right });
      } else {
        this.selection.setActive({ row: b.bottom, col: b.right });
        this.selection.extendTo({ row: b.top - count, col: b.left });
      }
      this.emitCellCommit('fill', changes);
    } else {
      const direction: FillDirection = right >= left ? 'right' : 'left';
      const count = direction === 'right' ? right : left;
      const seed = this.readBlock(b.top, b.left, b.bottom, b.right);
      const produced = fillRegion(seed, direction, count);
      const baseCol = direction === 'right' ? b.right + 1 : b.left - count;
      const changes = this.writeBlock(produced, b.top, baseCol);
      if (direction === 'right') {
        this.selection.setActive({ row: b.top, col: b.left });
        this.selection.extendTo({ row: b.bottom, col: b.right + count });
      } else {
        this.selection.setActive({ row: b.bottom, col: b.right });
        this.selection.extendTo({ row: b.top, col: b.left - count });
      }
      this.emitCellCommit('fill', changes);
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

  private writeBlock(block: readonly (readonly CellValue[])[], baseRow: number, baseCol: number): CellChange[] {
    const toRaw = (v: CellValue): string =>
      v === null ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v);
    const changes: CellChange[] = [];
    this.undo.transaction(() => {
      block.forEach((line, r) => {
        line.forEach((value, c) => {
          const row = baseRow + r;
          const col = baseCol + c;
          // fillTo only ever produces non-negative bases, so only the upper
          // grid bound can be exceeded.
          if (row < this.getRowCount() && col < this.getColCount()) {
            const p = this.toPhysical(row, col);
            const prev = this.getPhysicalEditText(p.row, p.col);
            this.undo.execute(this.setContentCommand(p, toRaw(value)));
            const change = this.cellChange(row, col, prev, this.getPhysicalEditText(p.row, p.col));
            if (change !== null) changes.push(change);
          }
        });
      });
    }, 'fill');
    return changes;
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
    // Snapshotting the whole grid is O(rows×cols); only pay it when someone listens.
    const before = this.emitter.listenerCount('cellcommit') > 0 ? this.captureContent() : null;
    if (this.undo.undo()) {
      this.emitter.emit('change', undefined);
      if (before !== null) {
        this.emitCellCommit('undo', this.diffContent(before));
      }
    }
  }
  redoLast(): void {
    const before = this.emitter.listenerCount('cellcommit') > 0 ? this.captureContent() : null;
    if (this.undo.redo()) {
      this.emitter.emit('change', undefined);
      if (before !== null) {
        this.emitCellCommit('redo', this.diffContent(before));
      }
    }
  }

  // ── Edit lifecycle ────────────────────────────────────────────────────────
  getEdit(): EditState | null {
    return this.editState;
  }

  beginEdit(row: number, col: number, initial?: string): void {
    if (!this.isCellEditable(row, col)) {
      return;
    }
    this.editState = {
      row,
      col,
      draft: initial ?? this.getEditText(row, col),
    };
    this.emitter.emit('edit', this.editState);
  }

  updateDraft(draft: string): void {
    if (this.editState !== null) {
      // Normalize full-width digits before column sanitizers run so a time
      // column's draft filter sees `9:30`, not `９：３０` (which it would strip).
      const normalized =
        this.getColumnFullWidthMode(this.editState.col) === 'normalize' ? normalizeFullWidth(draft) : draft;
      const options = this.inputOptionsFor(this.editState.col);
      let next = options?.sanitizeDraft?.(normalized, this.editState.draft) ?? normalized;
      if (options?.maxLength !== undefined && next.length > options.maxLength) {
        next = next.slice(0, options.maxLength);
      }
      this.editState = { ...this.editState, draft: next };
    }
  }

  commitEdit(): void {
    if (this.editState === null) {
      return;
    }
    const { row, col } = this.editState;
    let draft = this.editState.draft;
    const fullWidthMode = this.getColumnFullWidthMode(col);
    if (fullWidthMode !== 'off' && hasFullWidthNumeric(draft)) {
      if (fullWidthMode === 'reject') {
        this.editState = null;
        this.emitter.emit('inputreject', { row, col, raw: draft, reason: 'fullwidth' });
        this.emitter.emit('edit', null);
        return;
      }
      draft = normalizeFullWidth(draft);
    }
    const options = this.inputOptionsFor(col);
    const transformed = options?.commitTransform === undefined ? draft : options.commitTransform(draft);
    this.editState = null;
    if (transformed !== null) {
      const p = this.toPhysical(row, col);
      const prev = this.getPhysicalEditText(p.row, p.col);
      this.undo.execute(this.setContentCommand(p, transformed));
      const next = this.getPhysicalEditText(p.row, p.col);
      this.emitter.emit('change', undefined);
      const change = this.cellChange(row, col, prev, next);
      this.emitCellCommit('edit', change === null ? [] : [change]);
      // Validate the committed value against the column/cell validator (if any).
      void this.validation.validate(p.row, p.col, this.parseInput(transformed) as CellValue).then((ok) => {
        if (!ok) {
          this.emitter.emit('inputreject', { row, col, raw: transformed, reason: 'validator' });
        }
      });
    } else if (draft !== '') {
      // A transform refusing non-empty input is a rejection; an empty draft
      // through a null transform is an intentional no-op (e.g. blank time).
      this.emitter.emit('inputreject', { row, col, raw: draft, reason: 'transform' });
    }
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
    this.emitViewState();
  }
  resizeCol(col: number, width: number): void {
    this.colSizes.setSize(this.view.cols.getPhysicalIndex(col), width);
    this.rebuildViewSizes();
    this.emitter.emit('change', undefined);
    this.emitViewState();
  }

  /** Set width for a physical column. Out-of-range columns are ignored. */
  setColumnWidth(physicalCol: number, width: number): void {
    if (!validIndex(physicalCol, this.colCount)) {
      return;
    }
    this.colSizes.setSize(physicalCol, width);
    this.rebuildViewSizes();
    this.emitter.emit('change', undefined);
    this.emitViewState();
  }

  /** Reset every customized physical column width to the controller default. */
  resetColumnWidths(): void {
    for (const col of this.colSizes.getOverrides().keys()) {
      this.colSizes.resetSize(col);
    }
    this.rebuildViewSizes();
    this.emitter.emit('change', undefined);
    this.emitViewState();
  }

  /**
   * Opt-in, wrap-aware row auto-sizing: for each targeted row, wrap the display
   * text of every wrap-enabled column to its current width and set the row
   * height to fit the tallest wrapped block (clamped to `minHeight`). No-op
   * when no column has wrapping enabled. One change event for the whole batch.
   */
  autoSizeRows(options: AutoSizeRowsOptions): void {
    const wrapCols: number[] = [];
    for (let col = 0; col < this.getColCount(); col++) {
      if (this.getColumnWrap(col)) {
        wrapCols.push(col);
      }
    }
    if (wrapCols.length === 0) {
      return;
    }
    const paddingX = options.paddingX ?? 6;
    const paddingY = options.paddingY ?? 6;
    const minHeight = options.minHeight ?? this.defaultRowHeight;
    const rows =
      options.rows ?? Array.from({ length: this.getRowCount() }, (_, i) => i);
    for (const row of rows) {
      let height = minHeight;
      for (const col of wrapCols) {
        const text = this.getDisplay(row, col);
        if (text === '') {
          continue;
        }
        const wrapWidth = Math.max(1, this.getColumnWidth(col) - paddingX * 2);
        const candidate = autoRowHeight(text, wrapWidth, options.font, options.lineHeight, options.measure, {
          padding: paddingY,
        });
        if (candidate > height) {
          height = candidate;
        }
      }
      this.rowSizes.setSize(this.view.rows.getPhysicalIndex(row), height);
    }
    this.rebuildViewSizes();
    this.emitter.emit('change', undefined);
    this.emitViewState();
  }
}
