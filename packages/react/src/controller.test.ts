import { describe, it, expect, vi } from 'vitest';
import { GridController, formatValue } from './controller.js';
import { FormulaError } from '@lattica/formula';

const make = () => new GridController({ rowCount: 50, colCount: 26 });

describe('formatValue', () => {
  it('formats every value type', () => {
    expect(formatValue(null)).toBe('');
    expect(formatValue(42)).toBe('42');
    expect(formatValue('hi')).toBe('hi');
    expect(formatValue(true)).toBe('TRUE');
    expect(formatValue(false)).toBe('FALSE');
    expect(formatValue(new FormulaError('#DIV/0!'))).toBe('#DIV/0!');
  });
});

describe('GridController basics', () => {
  it('exposes dimensions and geometry', () => {
    const c = make();
    expect(c.getRowCount()).toBe(50);
    expect(c.getColCount()).toBe(26);
    const g = c.geometry();
    expect(g.rowHeaderWidth).toBe(48);
    expect(g.colSizes.getCount()).toBe(26);
  });

  it('applies custom sizing and header options', () => {
    const c = new GridController({
      rowCount: 5,
      colCount: 5,
      defaultRowHeight: 30,
      defaultColWidth: 120,
      rowHeaderWidth: 60,
      colHeaderHeight: 40,
      frozenRows: 1,
      frozenCols: 2,
    });
    expect(c.rowSizes.getSize(0)).toBe(30);
    expect(c.colSizes.getSize(0)).toBe(120);
    expect(c.geometry().frozenCols).toBe(2);
    expect(c.colHeaderHeight).toBe(40);
  });
});

describe('cell content and parsing', () => {
  it('stores numbers, booleans, strings, and formulas', () => {
    const c = make();
    c.setCellText(0, 0, '42');
    c.setCellText(0, 1, 'TRUE');
    c.setCellText(0, 2, 'hello');
    c.setCellText(0, 3, '=A1+10');
    expect(c.getDisplay(0, 0)).toBe('42');
    expect(c.getDisplay(0, 1)).toBe('TRUE');
    expect(c.getDisplay(0, 2)).toBe('hello');
    expect(c.getDisplay(0, 3)).toBe('52');
    expect(c.getEditText(0, 3)).toBe('=A1+10');
  });

  it('clears a cell on empty text', () => {
    const c = make();
    c.setCellText(0, 0, '5');
    c.setCellText(0, 0, '');
    expect(c.getDisplay(0, 0)).toBe('');
    expect(c.getEditText(0, 0)).toBe('');
  });

  it('keeps non-numeric strings as text', () => {
    const c = make();
    c.setCellText(0, 0, '007abc');
    expect(c.getDisplay(0, 0)).toBe('007abc');
  });

  it('emits change events', () => {
    const c = make();
    const listener = vi.fn();
    c.on('change', listener);
    c.setCellText(0, 0, '1');
    expect(listener).toHaveBeenCalled();
  });
});

describe('undo / redo', () => {
  it('undoes and redoes a cell edit', () => {
    const c = make();
    c.setCellText(0, 0, '1');
    c.setCellText(0, 0, '2');
    c.undoLast();
    expect(c.getDisplay(0, 0)).toBe('1');
    c.redoLast();
    expect(c.getDisplay(0, 0)).toBe('2');
  });

  it('undo of a no-op history does nothing', () => {
    const c = make();
    const listener = vi.fn();
    c.on('change', listener);
    c.undoLast();
    c.redoLast();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('delete / paste / copy', () => {
  it('deletes the selection as one undo step', () => {
    const c = make();
    c.setCellText(0, 0, '1');
    c.setCellText(0, 1, '2');
    c.selection.setActive({ row: 0, col: 0 });
    c.selection.extendTo({ row: 0, col: 1 });
    c.deleteSelection();
    expect(c.getDisplay(0, 0)).toBe('');
    expect(c.getDisplay(0, 1)).toBe('');
    c.undoLast();
    expect(c.getDisplay(0, 0)).toBe('1');
    expect(c.getDisplay(0, 1)).toBe('2');
  });

  it('pastes a matrix at the active cell, ignoring out-of-bounds', () => {
    const c = new GridController({ rowCount: 2, colCount: 2 });
    c.selection.setActive({ row: 0, col: 0 });
    c.paste([
      ['a', 'b'],
      ['c', 'd-overflow', 'x'],
    ]);
    expect(c.getDisplay(0, 0)).toBe('a');
    expect(c.getDisplay(1, 1)).toBe('d-overflow');
  });

  it('copies the selection bounding box as edit text', () => {
    const c = make();
    c.setCellText(0, 0, '1');
    c.setCellText(1, 1, '=1+1');
    c.selection.setActive({ row: 0, col: 0 });
    c.selection.extendTo({ row: 1, col: 1 });
    expect(c.copySelection()).toEqual([
      ['1', ''],
      ['', '=1+1'],
    ]);
  });
});

describe('edit lifecycle', () => {
  it('begins, updates, and commits an edit', () => {
    const c = make();
    const editEvents: unknown[] = [];
    c.on('edit', (e) => editEvents.push(e));
    c.beginEdit(2, 3, '9');
    expect(c.getEdit()).toMatchObject({ row: 2, col: 3, draft: '9' });
    c.updateDraft('99');
    c.commitEdit();
    expect(c.getDisplay(2, 3)).toBe('99');
    expect(c.getEdit()).toBeNull();
    expect(editEvents).toEqual([{ row: 2, col: 3, draft: '9' }, null]);
  });

  it('begins an edit from existing content when no initial is given', () => {
    const c = make();
    c.setCellText(0, 0, 'abc');
    c.beginEdit(0, 0);
    expect(c.getEdit()?.draft).toBe('abc');
  });

  it('cancels an edit without writing', () => {
    const c = make();
    c.beginEdit(0, 0, 'x');
    c.cancelEdit();
    expect(c.getDisplay(0, 0)).toBe('');
    expect(c.getEdit()).toBeNull();
  });

  it('commit / cancel are no-ops when not editing', () => {
    const c = make();
    expect(() => c.commitEdit()).not.toThrow();
    expect(() => c.cancelEdit()).not.toThrow();
    // updateDraft without an edit is ignored.
    c.updateDraft('ignored');
    expect(c.getEdit()).toBeNull();
  });
});

describe('resizing', () => {
  it('resizes rows and columns and emits change', () => {
    const c = make();
    const listener = vi.fn();
    c.on('change', listener);
    c.resizeRow(0, 40);
    c.resizeCol(0, 200);
    expect(c.rowSizes.getSize(0)).toBe(40);
    expect(c.colSizes.getSize(0)).toBe(200);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
