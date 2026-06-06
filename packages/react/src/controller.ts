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
  readonly rowSizes: SizeManager;
  readonly colSizes: SizeManager;
  readonly selection: SelectionModel;
  readonly undo = new UndoManager();
  /** Conditional-format rules applied across the grid (value-based). */
  readonly conditionalFormat = new ConditionalFormatModel();
  /** Current search matches/navigation state. */
  readonly search = new SearchState();
  private readonly columnTypes = new Map<number, string>();
  private readonly columnAligns = new Map<number, CellAlign>();
  private readonly searchKeys = new Set<string>();
  private readonly emitter = new Emitter<ControllerEvents>();

  private rowCount: number;
  private colCount: number;
  readonly rowHeaderWidth: number;
  readonly colHeaderHeight: number;
  frozenRows: number;
  frozenCols: number;

  private editState: EditState | null = null;

  constructor(options: GridControllerOptions) {
    this.rowCount = options.rowCount;
    this.colCount = options.colCount;
    this.rowSizes = new SizeManager({
      count: options.rowCount,
      defaultSize: options.defaultRowHeight ?? 24,
    });
    this.colSizes = new SizeManager({
      count: options.colCount,
      defaultSize: options.defaultColWidth ?? 100,
    });
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
    return this.rowCount;
  }
  getColCount(): number {
    return this.colCount;
  }

  /** Geometry snapshot for the renderer. */
  geometry(): GridGeometry {
    return {
      rowSizes: this.rowSizes,
      colSizes: this.colSizes,
      frozenRows: this.frozenRows,
      frozenCols: this.frozenCols,
      rowHeaderWidth: this.rowHeaderWidth,
      colHeaderHeight: this.colHeaderHeight,
    };
  }

  /** Display text of a cell (computed value, formatted). */
  getDisplay(row: number, col: number): string {
    return formatValue(this.engine.getValue({ row, col }));
  }

  /** Raw computed value of a cell (for value-based renderers / formatting). */
  getValue(row: number, col: number): unknown {
    const v = this.engine.getValue({ row, col });
    return FormulaError.is(v) ? v.type : v;
  }

  /** Raw editable text of a cell (`=formula` or literal). */
  getEditText(row: number, col: number): string {
    const content = this.engine.getContent({ row, col });
    return content === null ? '' : String(content);
  }

  // ── Column type & alignment ────────────────────────────────────────────────
  setColumnType(col: number, type: string): void {
    this.columnTypes.set(col, type);
    this.emitter.emit('change', undefined);
  }
  getColumnType(col: number): string | undefined {
    return this.columnTypes.get(col);
  }
  setColumnAlign(col: number, align: CellAlign): void {
    this.columnAligns.set(col, align);
    this.emitter.emit('change', undefined);
  }
  getColumnAlign(col: number): CellAlign | undefined {
    return this.columnAligns.get(col);
  }

  // ── Conditional formatting & search styling ────────────────────────────────
  /** Combined per-cell style: conditional-format rule, overlaid by a search-hit tint. */
  getCellStyle(row: number, col: number): CfStyle | null {
    const base = this.conditionalFormat.styleFor(
      this.engine.getValue({ row, col }) as never,
    );
    if (this.searchKeys.has(`${row},${col}`)) {
      return { ...(base ?? {}), background: '#fff3a3' };
    }
    return base;
  }

  /** Run a search over displayed cell text, updating match state. Returns hit count. */
  runSearch(query: string, options?: SearchOptions): number {
    const matches = searchGrid(
      this.rowCount,
      this.colCount,
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
    this.undo.execute(this.setContentCommand({ row, col }, raw));
    this.emitter.emit('change', undefined);
  }

  /** Clear the currently selected cells (undoable batch). */
  deleteSelection(): void {
    const ranges = this.selection.getState().ranges;
    this.undo.transaction(() => {
      for (const range of ranges) {
        forEachCell(range, (addr) => {
          if (this.engine.getContent(addr) !== null) {
            this.undo.execute(this.setContentCommand(addr, ''));
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
          if (row < this.rowCount && col < this.colCount) {
            this.undo.execute(this.setContentCommand({ row, col }, text));
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
          if (row < this.rowCount && col < this.colCount) {
            this.undo.execute(this.setContentCommand({ row, col }, toRaw(value)));
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

  // ── Sizing ────────────────────────────────────────────────────────────────
  resizeRow(row: number, height: number): void {
    this.rowSizes.setSize(row, height);
    this.emitter.emit('change', undefined);
  }
  resizeCol(col: number, width: number): void {
    this.colSizes.setSize(col, width);
    this.emitter.emit('change', undefined);
  }
}
