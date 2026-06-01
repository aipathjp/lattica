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
  type Command,
  type CellAddress,
  forEachCell,
  normalizeRange,
} from '@lattica/core';
import { SheetEngine, FormulaError, type CellContent } from '@lattica/formula';
import type { GridGeometry } from './geometry.js';

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

  /** Raw editable text of a cell (`=formula` or literal). */
  getEditText(row: number, col: number): string {
    const content = this.engine.getContent({ row, col });
    return content === null ? '' : String(content);
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
