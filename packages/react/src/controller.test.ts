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

describe('getValue', () => {
  it('returns the raw computed value and error type strings', () => {
    const c = make();
    c.setCellText(0, 0, '5');
    c.setCellText(0, 1, 'TRUE');
    c.setCellText(0, 2, '=1/0');
    expect(c.getValue(0, 0)).toBe(5);
    expect(c.getValue(0, 1)).toBe(true);
    expect(c.getValue(0, 2)).toBe('#DIV/0!');
    expect(c.getValue(9, 9)).toBeNull();
  });
});

describe('column type & alignment', () => {
  it('sets and reads column type and alignment, emitting change', () => {
    const c = make();
    const listener = vi.fn();
    c.on('change', listener);
    expect(c.getColumnType(0)).toBeUndefined();
    expect(c.getColumnAlign(0)).toBeUndefined();
    c.setColumnType(0, 'checkbox');
    c.setColumnAlign(1, 'right');
    expect(c.getColumnType(0)).toBe('checkbox');
    expect(c.getColumnAlign(1)).toBe('right');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('conditional formatting & search styling', () => {
  it('applies a conditional-format rule by value', () => {
    const c = make();
    c.setCellText(0, 0, '120');
    c.setCellText(0, 1, '5');
    c.conditionalFormat.addRule({ kind: 'gt', value: 100, style: { background: '#fee' } });
    expect(c.getCellStyle(0, 0)).toEqual({ background: '#fee' });
    expect(c.getCellStyle(0, 1)).toBeNull();
  });

  it('overlays a search highlight and merges with conditional format', () => {
    const c = make();
    c.setCellText(0, 0, 'apple');
    c.setCellText(1, 0, 'banana');
    c.conditionalFormat.addRule({ kind: 'contains', text: 'apple', style: { color: '#a00' } });
    const count = c.runSearch('apple');
    expect(count).toBe(1);
    expect(c.getCellStyle(0, 0)).toEqual({ color: '#a00', background: '#fff3a3' });
    expect(c.getCellStyle(1, 0)).toBeNull();
    expect(c.search.count).toBe(1);
  });

  it('search highlight without a conditional rule yields just the tint', () => {
    const c = make();
    c.setCellText(0, 0, 'find me');
    c.runSearch('find');
    expect(c.getCellStyle(0, 0)).toEqual({ background: '#fff3a3' });
  });

  it('runSearch emits change and clears prior matches', () => {
    const c = make();
    c.setCellText(0, 0, 'x');
    const listener = vi.fn();
    c.on('change', listener);
    expect(c.runSearch('x')).toBe(1);
    expect(c.runSearch('zzz')).toBe(0);
    expect(c.getCellStyle(0, 0)).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('fillTo (fill handle)', () => {
  const sel = (c: GridController, r0: number, c0: number, r1: number, c1: number) => {
    c.selection.setActive({ row: r0, col: c0 });
    c.selection.extendTo({ row: r1, col: c1 });
  };

  it('fills a numeric series downward', () => {
    const c = make();
    c.setCellText(0, 0, '1');
    c.setCellText(1, 0, '2');
    sel(c, 0, 0, 1, 0);
    c.fillTo(4, 0);
    expect(c.getDisplay(2, 0)).toBe('3');
    expect(c.getDisplay(3, 0)).toBe('4');
    expect(c.getDisplay(4, 0)).toBe('5');
  });

  it('fills a numeric series rightward', () => {
    const c = make();
    c.setCellText(0, 0, '1');
    c.setCellText(0, 1, '2');
    sel(c, 0, 0, 0, 1);
    c.fillTo(0, 4);
    expect(c.getDisplay(0, 2)).toBe('3');
    expect(c.getDisplay(0, 4)).toBe('5');
  });

  it('fills upward (series continues above)', () => {
    const c = make();
    c.setCellText(3, 0, '5');
    c.setCellText(4, 0, '6');
    sel(c, 3, 0, 4, 0);
    c.fillTo(0, 0);
    expect(c.getDisplay(2, 0)).toBe('4');
    expect(c.getDisplay(0, 0)).toBe('2');
  });

  it('fills leftward', () => {
    const c = make();
    c.setCellText(0, 4, '5');
    c.setCellText(0, 5, '6');
    sel(c, 0, 4, 0, 5);
    c.fillTo(0, 0);
    expect(c.getDisplay(0, 3)).toBe('4');
    expect(c.getDisplay(0, 0)).toBe('1');
  });

  it('copies a single non-series cell', () => {
    const c = make();
    c.setCellText(0, 0, 'x');
    sel(c, 0, 0, 0, 0);
    c.fillTo(2, 0);
    expect(c.getDisplay(1, 0)).toBe('x');
    expect(c.getDisplay(2, 0)).toBe('x');
  });

  it('is a no-op when the target is within the selection', () => {
    const c = make();
    c.setCellText(0, 0, '7');
    sel(c, 0, 0, 1, 1);
    const listener = vi.fn();
    c.on('change', listener);
    c.fillTo(1, 1);
    expect(listener).not.toHaveBeenCalled();
  });

  it('clamps writes to the grid bounds (rows and cols)', () => {
    const c = new GridController({ rowCount: 5, colCount: 5 });
    c.setCellText(0, 0, '1');
    sel(c, 0, 0, 0, 0);
    c.fillTo(99, 0); // beyond rowCount
    expect(c.getDisplay(4, 0)).toBe('1');
    sel(c, 0, 0, 0, 0);
    c.fillTo(0, 99); // beyond colCount
    expect(c.getDisplay(0, 4)).toBe('1');
  });

  it('is undoable as a single batch', () => {
    const c = make();
    c.setCellText(0, 0, '1');
    c.setCellText(1, 0, '2');
    sel(c, 0, 0, 1, 0);
    c.fillTo(4, 0);
    expect(c.getDisplay(4, 0)).toBe('5');
    c.undoLast();
    expect(c.getDisplay(2, 0)).toBe('');
    expect(c.getDisplay(4, 0)).toBe('');
  });
});

describe('fillTo value formatting', () => {
  it('writes boolean and empty values correctly', () => {
    const c = new GridController({ rowCount: 5, colCount: 5 });
    c.setCellText(0, 0, 'TRUE'); // boolean true
    c.setCellText(0, 1, 'FALSE'); // boolean false
    // 0,2 left empty (null)
    c.selection.setActive({ row: 0, col: 0 });
    c.selection.extendTo({ row: 0, col: 2 });
    c.fillTo(1, 2); // fill the 1x3 block down by one row (copy)
    expect(c.getDisplay(1, 0)).toBe('TRUE');
    expect(c.getDisplay(1, 1)).toBe('FALSE');
    expect(c.getDisplay(1, 2)).toBe('');
  });
});
