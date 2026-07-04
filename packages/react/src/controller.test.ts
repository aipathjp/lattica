import { describe, it, expect, vi } from 'vitest';
import { GridController, formatValue, replaceInText, parseNumberInput } from './controller.js';
import { FormulaError } from '@ai-path/tb-formula';

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

  it('resizes row and column counts dynamically', () => {
    const c = new GridController({ rowCount: 3, colCount: 2 });
    const listener = vi.fn();
    c.on('change', listener);
    c.selection.setActive({ row: 2, col: 1 });
    c.rowSizes.setSize(2, 40);
    c.colSizes.setSize(1, 140);

    c.setRowCount(5);
    c.setColCount(4);
    expect(c.getRowCount()).toBe(5);
    expect(c.getColCount()).toBe(4);
    expect(c.geometry().rowSizes.getCount()).toBe(5);
    expect(c.geometry().colSizes.getCount()).toBe(4);
    expect(c.rowSizes.getSize(4)).toBe(24);
    expect(c.colSizes.getSize(3)).toBe(100);

    c.setRowCount(2);
    c.setColCount(1);
    expect(c.getRowCount()).toBe(2);
    expect(c.getColCount()).toBe(1);
    expect(c.selection.getState().active).toEqual({ row: 1, col: 0 });
    expect(c.rowSizes.getOverrides().has(2)).toBe(false);
    expect(c.colSizes.getOverrides().has(1)).toBe(false);

    listener.mockClear();
    c.setRowCount(2);
    c.setColCount(1);
    expect(listener).not.toHaveBeenCalled();
    expect(() => c.setRowCount(-1)).toThrow(RangeError);
    expect(() => c.setColCount(-1)).toThrow(RangeError);
  });
});

describe('bulk data loading', () => {
  it('sets matrix data with resize, type conversion, full replacement, and no cellcommit', () => {
    const c = new GridController({ rowCount: 3, colCount: 4 });
    const changes = vi.fn();
    const commits = vi.fn();
    c.on('change', changes);
    c.on('cellcommit', commits);
    c.setCellText(0, 0, 'old');
    expect(c.undo.canUndo()).toBe(true);
    changes.mockClear();

    c.setData([
      ['Name', 'Qty', 'Active'],
      ['Apple', 3, true],
      ['Pear', null, false],
    ]);

    expect(c.getRowCount()).toBe(3);
    expect(c.getColCount()).toBe(3);
    expect(c.getDisplay(1, 1)).toBe('3');
    expect(c.getDisplay(1, 2)).toBe('TRUE');
    expect(c.getDisplay(2, 1)).toBe('');
    expect(c.getDisplay(2, 2)).toBe('FALSE');
    expect(c.undo.canUndo()).toBe(false);
    c.undoLast();
    expect(c.getDisplay(0, 0)).toBe('Name');
    expect(commits).not.toHaveBeenCalled();
    expect(changes).toHaveBeenCalledTimes(1);
  });

  it('loads without resizing and clears cells outside the matrix', () => {
    const c = new GridController({ rowCount: 2, colCount: 3 });
    c.setCellText(0, 2, 'stale');
    c.setCellText(1, 0, 'stale');
    c.setData([['=1+2']], { resize: false });
    expect(c.getRowCount()).toBe(2);
    expect(c.getColCount()).toBe(3);
    expect(c.getDisplay(0, 0)).toBe('3');
    expect(c.getEditText(0, 0)).toBe('=1+2');
    expect(c.getDisplay(0, 2)).toBe('');
    expect(c.getDisplay(1, 0)).toBe('');
  });

  it('loads records by field order', () => {
    const c = new GridController({ rowCount: 1, colCount: 1 });
    c.setRecords(
      [
        { item: 'Apple', qty: 3 },
        { item: 'Pear', qty: { nested: true } },
      ],
      ['item', 'qty'],
    );
    expect(c.getRowCount()).toBe(2);
    expect(c.getColCount()).toBe(2);
    expect(c.getDisplay(0, 0)).toBe('Apple');
    expect(c.getDisplay(0, 1)).toBe('3');
    expect(c.getDisplay(1, 1)).toBe('[object Object]');
  });

  it('ignores rich column definitions beyond the physical column count', () => {
    const c = new GridController({ rowCount: 1, colCount: 1 });
    expect(() =>
      c.applyColumnDefs([
        { headerName: 'A', width: 120 },
        { headerName: 'B', width: 240, type: 'number' },
      ]),
    ).not.toThrow();
    expect(c.getColumnWidth(0)).toBe(120);
    expect(c.getColCount()).toBe(1);
  });

  it('does not override explicit column input options with ColumnDef maxLength', () => {
    const c = new GridController({ rowCount: 1, colCount: 1 });
    c.setColumnInput(0, { maxLength: 2 });
    c.applyColumnDefs([{ headerName: 'Code', maxLength: 5 }]);
    c.beginEdit(0, 0, '');
    c.updateDraft('abcdef');
    expect(c.getEdit()?.draft).toBe('ab');
    c.cancelEdit();

    c.setColumnInput(0, null);
    c.beginEdit(0, 0, '');
    c.updateDraft('abcdef');
    expect(c.getEdit()?.draft).toBe('abcdef');
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

describe('cellcommit events', () => {
  it('emits edit changes only when the raw edit text changes', () => {
    const c = make();
    const listener = vi.fn();
    c.on('cellcommit', listener);
    c.beginEdit(1, 2, 'abc');
    c.commitEdit();
    expect(listener).toHaveBeenCalledWith({
      source: 'edit',
      changes: [{ row: 1, col: 2, physicalRow: 1, physicalCol: 2, prev: '', next: 'abc' }],
    });
    listener.mockClear();
    c.beginEdit(1, 2);
    c.commitEdit();
    expect(listener).not.toHaveBeenCalled();
  });

  it('emits paste, delete, fill, undo, and redo sources', () => {
    const c = make();
    const events: unknown[] = [];
    c.on('cellcommit', (event) => events.push(event));
    c.selection.setActive({ row: 0, col: 0 });
    c.paste([['1', '2']]);
    c.selection.extendTo({ row: 0, col: 1 });
    c.deleteSelection();
    c.setCellText(0, 0, '1');
    c.setCellText(1, 0, '2');
    c.selection.setActive({ row: 0, col: 0 });
    c.selection.extendTo({ row: 1, col: 0 });
    c.fillTo(3, 0);
    c.undoLast();
    c.redoLast();
    expect(events.map((e) => (e as { source: string }).source)).toEqual([
      'paste',
      'delete',
      'fill',
      'undo',
      'redo',
    ]);
    expect((events[0] as { changes: unknown[] }).changes).toHaveLength(2);
  });

  it('does not emit paste or delete events when no cell changes', () => {
    const c = make();
    const listener = vi.fn();
    c.on('cellcommit', listener);
    c.paste([['']]);
    c.deleteSelection();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('read-only UI edit state', () => {
  it('blocks beginEdit for read-only columns and cells', () => {
    const c = make();
    c.setColumnEditable(0, false);
    c.beginEdit(0, 0);
    expect(c.getEdit()).toBeNull();
    c.beginEdit(0, 1);
    expect(c.getEdit()).not.toBeNull();
    c.cancelEdit();
    c.setCellReadOnly(0, 1, true);
    c.beginEdit(0, 1);
    expect(c.getEdit()).toBeNull();
  });

  it('cell read-only has priority over column editable state', () => {
    const c = make();
    expect(c.isCellEditable(0, 0)).toBe(true);
    c.setColumnEditable(0, false);
    expect(c.isCellEditable(0, 0)).toBe(false);
    c.setColumnEditable(0, true);
    c.setCellReadOnly(0, 0, true);
    expect(c.isCellEditable(0, 0)).toBe(false);
    c.setCellReadOnly(0, 0, false);
    expect(c.isCellEditable(0, 0)).toBe(true);
  });
});

describe('column input pipeline', () => {
  it('sanitizes drafts, applies max length, and transforms commits', () => {
    const c = make();
    c.setColumnInput(0, {
      sanitizeDraft: (draft, prev) => `${prev}${draft.replace(/\D/g, '')}`,
      maxLength: 3,
      commitTransform: (raw) => `#${raw}`,
    });
    c.beginEdit(0, 0, '');
    c.updateDraft('a1');
    expect(c.getEdit()?.draft).toBe('1');
    c.updateDraft('b234');
    expect(c.getEdit()?.draft).toBe('123');
    c.commitEdit();
    expect(c.getEditText(0, 0)).toBe('#123');
  });

  it('cancels a commit when commitTransform returns null and clears explicit options', () => {
    const c = make();
    const listener = vi.fn();
    c.on('cellcommit', listener);
    c.setColumnInput(0, { commitTransform: () => null });
    c.beginEdit(0, 0, 'x');
    c.commitEdit();
    expect(c.getEditText(0, 0)).toBe('');
    expect(listener).not.toHaveBeenCalled();
    c.setColumnInput(0, null);
    c.beginEdit(0, 0, 'x');
    c.commitEdit();
    expect(c.getEditText(0, 0)).toBe('x');
  });

  it('normalizes the built-in time type end-to-end', () => {
    const c = make();
    c.setColumnType(0, 'time');
    c.beginEdit(0, 0);
    c.updateDraft('1330');
    c.commitEdit();
    expect(c.getEditText(0, 0)).toBe('13:30');
  });

  it('explicit column input takes priority over the built-in time pipeline', () => {
    const c = make();
    c.setColumnType(0, 'time');
    c.setColumnInput(0, { commitTransform: (raw) => raw });
    c.beginEdit(0, 0, '1330');
    c.commitEdit();
    expect(c.getEditText(0, 0)).toBe('1330');
  });

  it('stores and clears column type options via setColumnType', () => {
    const c = make();
    c.setColumnType(0, 'time', { timeOrDecimalHours: true });
    expect(c.getColumnTypeOptions(0)).toEqual({ timeOrDecimalHours: true });
    expect(c.getColumnTypeOptions(1)).toBeUndefined();
    c.setColumnType(0, 'time');
    expect(c.getColumnTypeOptions(0)).toBeUndefined();
  });

  it('accepts decimal hours on a time column with timeOrDecimalHours', () => {
    const c = make();
    c.setColumnType(0, 'time', { timeOrDecimalHours: true });
    c.beginEdit(0, 0);
    c.updateDraft('1.5x');
    expect(c.getEdit()?.draft).toBe('1.5');
    c.commitEdit();
    expect(c.getEditText(0, 0)).toBe('1.5');
    expect(c.getValue(0, 0)).toBe(1.5);

    c.beginEdit(1, 0, '1613');
    c.commitEdit();
    expect(c.getEditText(1, 0)).toBe('16:13');
  });

  it('absorbs Excel time serials on a time column with excelTimeSerial', () => {
    const c = make();
    c.setColumnType(0, 'time', { excelTimeSerial: true });
    c.beginEdit(0, 0, '0.5');
    c.commitEdit();
    expect(c.getEditText(0, 0)).toBe('12:00');
  });

  it('falls back to the strict time pipeline when type options are all disabled', () => {
    const c = make();
    c.setColumnType(0, 'time', {});
    c.beginEdit(0, 0);
    c.updateDraft('1.30');
    expect(c.getEdit()?.draft).toBe('130'); // strict sanitizer drops the dot
    c.commitEdit();
    expect(c.getEditText(0, 0)).toBe('01:30');
  });

  it('normalizes the elapsed type end-to-end and formats its display', () => {
    const c = make();
    c.setColumnType(0, 'elapsed');
    c.beginEdit(0, 0);
    c.updateDraft('3a0:15');
    expect(c.getEdit()?.draft).toBe('30:15');
    c.commitEdit();
    expect(c.getEditText(0, 0)).toBe('30:15');
    expect(c.getDisplay(0, 0)).toBe('1:06:15');

    c.beginEdit(1, 0, '9:05');
    c.commitEdit();
    expect(c.getDisplay(1, 0)).toBe('09:05');
  });

  it('cancels invalid elapsed input and leaves non-string elapsed values untouched', () => {
    const c = make();
    c.setColumnType(0, 'elapsed');
    c.beginEdit(0, 0, '1:99');
    c.commitEdit();
    expect(c.getEditText(0, 0)).toBe('');

    // A numeric value in an elapsed column falls through to the plain formatter.
    c.setCellText(1, 0, '42');
    expect(c.getDisplay(1, 0)).toBe('42');
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
    expect(c.getRowHeight(0)).toBe(40);
    expect(c.getColumnWidth(0)).toBe(200);
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

describe('DataView integration (sort / filter)', () => {
  const seeded = () => {
    const c = new GridController({ rowCount: 3, colCount: 2 });
    c.setCellText(0, 0, '3');
    c.setCellText(1, 0, '1');
    c.setCellText(2, 0, '2');
    return c;
  };

  it('sorts rows ascending/descending and cycles back to none', () => {
    const c = seeded();
    expect(c.getSortDirection(0)).toBeNull();
    c.toggleSort(0); // asc
    expect(c.getSortDirection(0)).toBe('asc');
    expect([c.getDisplay(0, 0), c.getDisplay(1, 0), c.getDisplay(2, 0)]).toEqual(['1', '2', '3']);
    c.toggleSort(0); // desc
    expect(c.getSortDirection(0)).toBe('desc');
    expect([c.getDisplay(0, 0), c.getDisplay(1, 0), c.getDisplay(2, 0)]).toEqual(['3', '2', '1']);
    c.toggleSort(0); // none
    expect(c.getSortDirection(0)).toBeNull();
    expect([c.getDisplay(0, 0), c.getDisplay(1, 0), c.getDisplay(2, 0)]).toEqual(['3', '1', '2']);
  });

  it('additive sort keeps prior columns', () => {
    const c = seeded();
    c.toggleSort(0);
    c.toggleSort(1, true);
    expect(c.getSortDirection(0)).toBe('asc');
    expect(c.getSortDirection(1)).toBe('asc');
  });

  it('filters rows out and reports the reduced row count', () => {
    const c = seeded();
    c.setColumnFilter(0, [{ kind: 'gt', value: 1 }]);
    expect(c.getRowCount()).toBe(2);
    expect([c.getDisplay(0, 0), c.getDisplay(1, 0)]).toEqual(['3', '2']);
    c.setColumnFilter(0, []); // clear
    expect(c.getRowCount()).toBe(3);
  });

  it('filters with an explicit conjunction', () => {
    const c = seeded();
    c.setColumnFilter(0, [{ kind: 'gte', value: 2 }, { kind: 'lte', value: 3 }], 'and');
    expect(c.getRowCount()).toBe(2); // 3 and 2
  });

  it('clearView resets sort and filter', () => {
    const c = seeded();
    c.toggleSort(0);
    c.setColumnFilter(0, [{ kind: 'gt', value: 1 }]);
    c.clearView();
    expect(c.getSortDirection(0)).toBeNull();
    expect(c.getRowCount()).toBe(3);
    expect(c.getDisplay(1, 0)).toBe('1');
  });

  it('a custom row height follows its row when sorted', () => {
    const c = seeded();
    c.resizeRow(2, 40); // physical row 2 (value "2")
    c.toggleSort(0); // asc -> value 2 (physical row 2) is at visual index 1
    expect(c.geometry().rowSizes.getSize(1)).toBe(40);
  });

  it('editing a sorted cell writes to the correct physical row', () => {
    const c = seeded();
    c.toggleSort(0); // asc: visual 0 -> physical row 1
    c.setCellText(0, 0, '9'); // edit the top visible cell
    c.clearView();
    expect(c.getDisplay(1, 0)).toBe('9'); // physical row 1 changed
  });
});

describe('DataView with error cells', () => {
  it('sorts a column containing an error value without throwing', () => {
    const c = new GridController({ rowCount: 3, colCount: 1 });
    c.setCellText(0, 0, '=1/0');
    c.setCellText(1, 0, '1');
    c.setCellText(2, 0, '2');
    expect(() => c.toggleSort(0)).not.toThrow();
    expect(c.getRowCount()).toBe(3);
  });
});

describe('merged cells', () => {
  it('merges the selection and maps covered cells to the anchor', () => {
    const c = make();
    c.selection.setActive({ row: 0, col: 0 });
    c.selection.extendTo({ row: 1, col: 1 });
    c.mergeSelection();
    expect(c.getMerge(0, 0)).toMatchObject({ row: 0, col: 0, rowspan: 2, colspan: 2 });
    expect(c.getMerge(1, 1)).toMatchObject({ row: 0, col: 0 });
  });

  it('treats a 1x1 selection merge as a no-op', () => {
    const c = make();
    c.selection.setActive({ row: 0, col: 0 });
    c.mergeSelection();
    expect(c.getMerge(0, 0)).toBeNull();
  });

  it('unmerges via a covered cell', () => {
    const c = make();
    c.selection.setActive({ row: 0, col: 0 });
    c.selection.extendTo({ row: 1, col: 1 });
    c.mergeSelection();
    c.unmerge(1, 1);
    expect(c.getMerge(0, 0)).toBeNull();
  });

  it('unmerge on a non-merged cell is a no-op', () => {
    const c = make();
    expect(() => c.unmerge(0, 0)).not.toThrow();
    expect(c.getMerge(0, 0)).toBeNull();
  });
});

describe('nested rows', () => {
  // physical rows: 0 (parent) -> 1,2 ; 3 (parent) -> 4
  const tree = () => new GridController({ rowCount: 5, colCount: 1 });
  const setup = (c: GridController) => {
    for (let r = 0; r < 5; r++) c.setCellText(r, 0, `r${r}`);
    c.setRowTree([{ row: 0, children: [{ row: 1 }, { row: 2 }] }, { row: 3, children: [{ row: 4 }] }]);
  };

  it('reports parent/depth/collapsed for rows', () => {
    const c = tree();
    setup(c);
    expect(c.isRowParent(0)).toBe(true);
    expect(c.isRowParent(1)).toBe(false);
    expect(c.getRowDepth(0)).toBe(0);
    expect(c.getRowDepth(1)).toBe(1);
    expect(c.isRowCollapsed(0)).toBe(false);
  });

  it('collapsing a parent hides its descendants', () => {
    const c = tree();
    setup(c);
    c.toggleRowGroup(0);
    expect(c.isRowCollapsed(0)).toBe(true);
    // rows 1,2 hidden -> visible rows: r0, r3, r4 = 3
    expect(c.getRowCount()).toBe(3);
    expect([c.getDisplay(0, 0), c.getDisplay(1, 0), c.getDisplay(2, 0)]).toEqual(['r0', 'r3', 'r4']);
    c.toggleRowGroup(0); // expand
    expect(c.getRowCount()).toBe(5);
  });

  it('combines nested collapse with a column filter', () => {
    const c = tree();
    setup(c);
    c.toggleRowGroup(3); // hide r4
    expect(c.getRowCount()).toBe(4);
    c.setColumnFilter(0, [{ kind: 'notContains', text: 'r1' }]); // additionally hide r1
    expect(c.getRowCount()).toBe(3); // r0,r2,r3 (r1 filtered, r4 nested-hidden)
    c.clearView();
    expect(c.getRowCount()).toBe(4); // filter cleared, nested r4 still hidden
  });
});

describe('editors, options & validation (Phase A)', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('resolves editor kind from column type', () => {
    const c = make();
    expect(c.getEditorKind(0)).toBe('text');
    c.setColumnType(0, 'dropdown');
    c.setColumnType(1, 'date');
    c.setColumnType(2, 'autocomplete');
    c.setColumnType(3, 'checkbox');
    expect(c.getEditorKind(0)).toBe('dropdown');
    expect(c.getEditorKind(1)).toBe('date');
    expect(c.getEditorKind(2)).toBe('autocomplete');
    expect(c.getEditorKind(3)).toBe('checkbox');
  });

  it('stores column options and applies a list validator for dropdowns', async () => {
    const c = make();
    const changed = vi.fn();
    c.on('change', changed);
    c.setColumnOptions(0, ['Tokyo', 'Osaka']);
    expect(c.getColumnOptions(0)).toEqual(['Tokyo', 'Osaka']);
    expect(changed).toHaveBeenCalled();

    // Committing an out-of-list value flags the cell invalid.
    c.beginEdit(0, 0, 'Nowhere');
    c.commitEdit();
    await flush();
    expect(c.isInvalid(0, 0)).toBe(true);

    // A valid value clears it.
    c.beginEdit(0, 0, 'Osaka');
    c.commitEdit();
    await flush();
    expect(c.isInvalid(0, 0)).toBe(false);
  });

  it('returns undefined options when none set', () => {
    expect(make().getColumnOptions(5)).toBeUndefined();
  });

  it('supports a custom column validator and tints invalid cells red', async () => {
    const c = make();
    c.setColumnValidator(0, (v) => typeof v === 'number' && v > 0);
    c.beginEdit(0, 0, '-3');
    c.commitEdit();
    await flush();
    expect(c.isInvalid(0, 0)).toBe(true);
    const style = c.getCellStyle(0, 0);
    expect(style?.background).toBe('#ffd6d6');
    expect(style?.color).toBe('#b00020');
  });

  it('commitEdit without a validator leaves the cell valid', async () => {
    const c = make();
    c.beginEdit(0, 0, 'free text');
    c.commitEdit();
    await flush();
    expect(c.isInvalid(0, 0)).toBe(false);
  });
});

describe('custom editor kinds (P2-1)', () => {
  it('sets, reads, and clears a column editor kind', () => {
    const c = make();
    const changed = vi.fn();
    c.on('change', changed);
    expect(c.getColumnEditor(0)).toBeUndefined();
    c.setColumnEditor(0, 'color');
    expect(c.getColumnEditor(0)).toBe('color');
    expect(changed).toHaveBeenCalled();
    c.setColumnEditor(0, null);
    expect(c.getColumnEditor(0)).toBeUndefined();
  });

  it('resolves the editor kind through visual→physical column mapping', () => {
    const c = make();
    c.setColumnEditor(2, 'picker');
    c.moveColumn(2, 0);
    expect(c.getColumnEditor(0)).toBe('picker');
    expect(c.getColumnEditor(2)).toBeUndefined();
  });

  it('applies ColumnDef.editor via applyColumnDefs', () => {
    const c = make();
    c.applyColumnDefs([
      { headerName: 'Color', editor: 'color' },
      { headerName: 'Plain' },
    ]);
    expect(c.getColumnEditor(0)).toBe('color');
    expect(c.getColumnEditor(1)).toBeUndefined();
  });
});

describe('Phase B — column ops, facets, aggregation, replace', () => {
  const seedCol = (c: GridController, col: number, vals: (string | number)[]) =>
    vals.forEach((v, r) => c.setCellText(r, col, String(v)));

  it('hides and shows a column', () => {
    const c = make();
    seedCol(c, 0, [1, 2]);
    seedCol(c, 1, [3, 4]);
    expect(c.getColCount()).toBe(26);
    c.hideColumn(0);
    expect(c.getColCount()).toBe(25);
    // visual col 0 is now the old physical col 1
    expect(c.getDisplay(0, 0)).toBe('3');
    expect(c.isColumnHidden(0)).toBe(true);
    c.showColumn(0);
    expect(c.getColCount()).toBe(26);
    expect(c.isColumnHidden(0)).toBe(false);
  });

  it('moves a column', () => {
    const c = make();
    seedCol(c, 0, [10]);
    seedCol(c, 1, [20]);
    seedCol(c, 2, [30]);
    c.moveColumn(0, 2); // move col A so it sits before visual position 2
    expect(c.getDisplay(0, 0)).toBe('20');
    expect(c.getDisplay(0, 1)).toBe('10');
    expect(c.getDisplay(0, 2)).toBe('30');
  });

  it('reports the physical column behind a visual column', () => {
    const c = make();
    c.moveColumn(0, 2);
    expect(c.getPhysicalCol(0)).toBe(1);
  });

  it('computes column facets (distinct labels sorted)', () => {
    const c = make();
    seedCol(c, 0, ['b', 'a', 'b', 'c', 'a']);
    const facets = c.columnFacets(0);
    expect(facets.map((f) => f.label)).toEqual(['', 'a', 'b', 'c']);
  });

  it('applies and clears a set filter', () => {
    const c = make();
    ['x', 'y', 'z', 'x'].forEach((v, r) => c.setCellText(r, 0, v));
    c.setColumnSetFilter(0, ['x']);
    expect(c.getRowCount()).toBe(2);
    expect(c.getDisplay(0, 0)).toBe('x');
    c.setColumnSetFilter(0, []); // clear
    expect(c.getRowCount()).toBe(50);
  });

  it('aggregates a column over visible rows', () => {
    const c = make();
    seedCol(c, 0, [10, 20, 30]);
    expect(c.aggregateColumn(0, 'sum')).toBe(60);
    expect(c.aggregateColumn(0, 'avg')).toBe(20);
    expect(c.aggregateColumn(0, 'count')).toBe(3);
    // After filtering, aggregation reflects only visible rows.
    c.setColumnFilter(0, [{ kind: 'gt', value: 15 }]);
    expect(c.aggregateColumn(0, 'sum')).toBe(50);
  });

  it('replaceAll replaces matching cell text (undoable)', () => {
    const c = make();
    c.setCellText(0, 0, 'cat');
    c.setCellText(1, 0, 'caterpillar');
    c.setCellText(2, 0, 'dog');
    const n = c.replaceAll('cat', 'CAT');
    expect(n).toBe(2);
    expect(c.getDisplay(0, 0)).toBe('CAT');
    expect(c.getDisplay(1, 0)).toBe('CATerpillar');
    expect(c.getDisplay(2, 0)).toBe('dog');
    c.undoLast();
    expect(c.getDisplay(0, 0)).toBe('cat');
  });

  it('replaceAll honors wholeCell and returns 0 for empty query / no match', () => {
    const c = make();
    c.setCellText(0, 0, 'cat');
    c.setCellText(1, 0, 'category');
    expect(c.replaceAll('cat', 'X', { wholeCell: true })).toBe(1);
    expect(c.getDisplay(0, 0)).toBe('X');
    expect(c.getDisplay(1, 0)).toBe('category');
    expect(c.replaceAll('', 'Y')).toBe(0);
    expect(c.replaceAll('zzz', 'Y')).toBe(0);
  });
});

describe('replaceInText', () => {
  it('literal global replace (default, case-insensitive)', () => {
    expect(replaceInText('aAa', 'a', 'b')).toBe('bbb');
  });
  it('case-sensitive replace', () => {
    expect(replaceInText('aAa', 'a', 'b', { caseSensitive: true })).toBe('bAb');
  });
  it('escapes regex metachars in literal mode', () => {
    expect(replaceInText('1+1=2', '+', '-')).toBe('1-1=2');
  });
  it('wholeCell only replaces a full match', () => {
    expect(replaceInText('cat', 'cat', 'X', { wholeCell: true })).toBe('X');
    expect(replaceInText('cats', 'cat', 'X', { wholeCell: true })).toBe('cats');
  });
  it('regex mode applies the pattern', () => {
    expect(replaceInText('a1b2', '[0-9]', '#', { regex: true })).toBe('a#b#');
  });
  it('invalid regex leaves text unchanged', () => {
    expect(replaceInText('abc', '(', 'X', { regex: true })).toBe('abc');
  });
});

describe('Phase C — number format & selection summary', () => {
  it('formats numeric cells with a column number format', () => {
    const c = make();
    c.setCellText(0, 0, '1234.5');
    c.setCellText(1, 0, 'text'); // non-numeric stays literal
    c.setColumnFormat(0, '#,##0.00');
    expect(c.getDisplay(0, 0)).toBe('1,234.50');
    expect(c.getDisplay(1, 0)).toBe('text');
    expect(c.getColumnFormat(0)).toBe('#,##0.00');
  });

  it('leaves cells unformatted when no column format is set', () => {
    const c = make();
    c.setCellText(0, 0, '5');
    expect(c.getDisplay(0, 0)).toBe('5');
    expect(c.getColumnFormat(0)).toBeUndefined();
  });

  it('aggregates the current selection', () => {
    const c = make();
    c.setCellText(0, 0, '10');
    c.setCellText(1, 0, '20');
    c.setCellText(2, 0, '30');
    c.selection.setActive({ row: 0, col: 0 });
    c.selection.extendTo({ row: 2, col: 0 });
    expect(c.aggregateSelection('sum')).toBe(60);
    const s = c.selectionSummary();
    expect(s).toEqual({ count: 3, sum: 60, avg: 20, min: 10, max: 30 });
  });

  it('selection summary over empty cells reports null aggregates', () => {
    const c = make();
    c.selection.setActive({ row: 5, col: 5 });
    const s = c.selectionSummary();
    expect(s).toEqual({ count: 0, sum: null, avg: null, min: null, max: null });
  });
});

describe('Phase C-2 — visual conditional formatting', () => {
  const seed = (c: GridController) => {
    [0, 5, 10].forEach((v, r) => c.setCellText(r, 0, String(v)));
  };

  it('color scale produces a per-cell background', () => {
    const c = make();
    seed(c);
    c.setColorScale(0, ['#000000', '#ffffff']);
    expect(c.getCellVisual(0, 0)).toEqual({ background: '#000000' });
    expect(c.getCellVisual(1, 0)).toEqual({ background: '#808080' });
    expect(c.getCellVisual(2, 0)).toEqual({ background: '#ffffff' });
  });

  it('data bar produces a ratio + color', () => {
    const c = make();
    seed(c);
    c.setDataBar(0, '#39f');
    expect(c.getCellVisual(1, 0)).toEqual({ bar: { ratio: 0.5, color: '#39f' } });
  });

  it('icon set picks a level by bucket', () => {
    const c = make();
    seed(c);
    c.setIconSet(0, 'traffic');
    expect(c.getCellVisual(0, 0)?.icon).toEqual({ set: 'traffic', level: 0, total: 3 });
    expect(c.getCellVisual(2, 0)?.icon).toEqual({ set: 'traffic', level: 2, total: 3 });
  });

  it('returns null without a rule, for non-numeric values, or an all-empty column', () => {
    const c = make();
    expect(c.getCellVisual(0, 0)).toBeNull(); // no rule
    c.setDataBar(0, '#39f');
    expect(c.getCellVisual(0, 0)).toBeNull(); // rule set but column empty
    c.setCellText(0, 0, 'text');
    expect(c.getCellVisual(0, 0)).toBeNull(); // non-numeric value
  });

  it('clears a visual rule', () => {
    const c = make();
    seed(c);
    c.setDataBar(0, '#39f');
    expect(c.getCellVisual(1, 0)).not.toBeNull();
    c.clearColumnVisual(0);
    expect(c.getCellVisual(1, 0)).toBeNull();
    // Clearing an absent rule is a no-op (no throw).
    expect(() => c.clearColumnVisual(0)).not.toThrow();
  });
});

describe('Phase E-2 — sparklines', () => {
  it('computes a line sparkline shape sized to the cell', () => {
    const c = make();
    c.setCellSparkline(0, 0, [1, 5, 2], 'line');
    const s = c.getCellSparkline(0, 0, 50, 20);
    expect(s?.kind).toBe('line');
    expect(s?.points).toHaveLength(3);
  });
  it('computes bar sparklines and returns null without a spec', () => {
    const c = make();
    expect(c.getCellSparkline(0, 0, 50, 20)).toBeNull();
    c.setCellSparkline(0, 0, [3, 1], 'bar');
    expect(c.getCellSparkline(0, 0, 50, 20)?.kind).toBe('bar');
  });
});

describe('Phase E-7 — master/detail', () => {
  it('toggles detail and enlarges the row height by the detail height', () => {
    const c = make();
    expect(c.isDetailExpanded(0)).toBe(false);
    const baseH = c.geometry().rowSizes.getSize(0);
    c.toggleDetail(0);
    expect(c.isDetailExpanded(0)).toBe(true);
    expect(c.geometry().rowSizes.getSize(0)).toBe(baseH + c.getDetailHeight());
    c.toggleDetail(0);
    expect(c.isDetailExpanded(0)).toBe(false);
    expect(c.geometry().rowSizes.getSize(0)).toBe(baseH);
  });

  it('setDetailHeight changes reserved space and emits', () => {
    const c = make();
    const listener = vi.fn();
    c.on('change', listener);
    c.setDetailHeight(200);
    expect(c.getDetailHeight()).toBe(200);
    c.toggleDetail(1);
    expect(c.geometry().rowSizes.getSize(1)).toBe(24 + 200);
    expect(listener).toHaveBeenCalled();
    c.setDetailHeight(-50); // clamped to 0
    expect(c.getDetailHeight()).toBe(0);
  });

  it('maps a visual row to its physical row', () => {
    const c = make();
    expect(c.getPhysicalRow(3)).toBe(3); // identity view
  });
});

describe('formula bar support', () => {
  it('reports the active cell, ref, and edit text', () => {
    const c = make();
    c.setCellText(2, 1, '=1+2');
    c.selection.setActive({ row: 2, col: 1 });
    expect(c.getActiveCell()).toEqual({ row: 2, col: 1 });
    expect(c.getActiveRef()).toBe('B3');
    expect(c.getActiveEditText()).toBe('=1+2');
  });

  it('sets the active cell content', () => {
    const c = make();
    c.selection.setActive({ row: 0, col: 0 });
    c.setActiveCellText('=10*2');
    expect(c.getDisplay(0, 0)).toBe('20');
  });

  it('goToRef selects a valid A1 reference and rejects bad/out-of-range ones', () => {
    const c = make();
    expect(c.goToRef('C5')).toBe(true);
    expect(c.getActiveCell()).toEqual({ row: 4, col: 2 });
    expect(c.goToRef('nonsense')).toBe(false);
    expect(c.goToRef('A9999')).toBe(false); // beyond rowCount (50)
  });

  it('goToRef returns false for a filtered-out (hidden) reference', () => {
    const c = make();
    c.setCellText(0, 0, 'keep');
    c.setCellText(1, 0, 'drop');
    c.setColumnFilter(0, [{ kind: 'equals', value: 'keep' }]); // hides row 1
    expect(c.goToRef('A2')).toBe(false);
  });
});

describe('parseNumberInput / formatted input', () => {
  it('parses plain numbers', () => {
    expect(parseNumberInput('1650')).toBe(1650);
    expect(parseNumberInput('-2.5')).toBe(-2.5);
    expect(parseNumberInput('1e3')).toBe(1000);
  });
  it('parses thousands separators and currency symbols', () => {
    expect(parseNumberInput('1,234')).toBe(1234);
    expect(parseNumberInput('1,234.56')).toBe(1234.56);
    expect(parseNumberInput('$1,000')).toBe(1000);
    expect(parseNumberInput('¥500')).toBe(500);
    expect(parseNumberInput('-$5')).toBe(-5);
  });
  it('parses trailing percent to a fraction', () => {
    expect(parseNumberInput('50%')).toBe(0.5);
    expect(parseNumberInput('12.5%')).toBe(0.125);
  });
  it('returns null for non-numeric or malformed grouping', () => {
    expect(parseNumberInput('')).toBeNull();
    expect(parseNumberInput('abc')).toBeNull();
    expect(parseNumberInput('12,34')).toBeNull();
    expect(parseNumberInput('1-2')).toBeNull();
  });

  it('stores formatted input as a number so column formats apply', () => {
    const c = make();
    c.setColumnFormat(0, '$#,##0.00');
    c.setCellText(0, 0, '1,234'); // typed with a comma
    expect(c.getValue(0, 0)).toBe(1234);
    expect(c.getDisplay(0, 0)).toBe('$1,234.00');
    c.setCellText(1, 0, '$2,000');
    expect(c.getDisplay(1, 0)).toBe('$2,000.00');
  });

  it('percent input round-trips through a percent format', () => {
    const c = make();
    c.setColumnFormat(0, '0.0%');
    c.setCellText(0, 0, '50%');
    expect(c.getValue(0, 0)).toBe(0.5);
    expect(c.getDisplay(0, 0)).toBe('50.0%');
  });
});

describe('view-state persistence', () => {
  const seed = (c: GridController) => {
    c.setCellText(0, 0, '3');
    c.setCellText(1, 0, '1');
    c.setCellText(2, 0, '2');
    c.setCellText(0, 1, 'A');
    c.setCellText(1, 1, 'B');
    c.setCellText(2, 1, 'C');
  };

  it('captures resize, hide, move, sort, and frozen state in physical coordinates', () => {
    const c = new GridController({ rowCount: 4, colCount: 4 });
    seed(c);
    c.resizeCol(1, 140);
    c.resizeRow(2, 36);
    c.moveColumn(0, 3);
    c.hideColumn(1); // visual 1 is physical 2 after the move
    c.toggleSort(1); // visual 1 is physical 3 after hiding physical 2
    c.frozenRows = 1;
    c.frozenCols = 2;
    expect(c.captureViewState()).toEqual({
      version: 1,
      columnWidths: { 1: 140 },
      rowHeights: { 2: 36 },
      hiddenColumns: [2],
      columnOrder: [1, 2, 0, 3],
      sort: [{ col: 0, direction: 'asc' }],
      frozenRows: 1,
      frozenCols: 2,
    });
  });

  it('applies captured state and round-trips it', () => {
    const source = new GridController({ rowCount: 4, colCount: 4 });
    seed(source);
    source.resizeCol(1, 140);
    source.resizeRow(2, 36);
    source.moveColumn(0, 3);
    source.hideColumn(1);
    source.toggleSort(1);
    source.frozenRows = 1;
    source.frozenCols = 2;
    const snapshot = source.captureViewState();

    const restored = new GridController({ rowCount: 4, colCount: 4 });
    seed(restored);
    restored.applyViewState(snapshot);

    expect(restored.captureViewState()).toEqual(snapshot);
    expect(restored.getColumnWidth(restored.view.cols.getVisualIndex(1))).toBe(140);
    expect(restored.getRowHeight(restored.view.rows.getVisualIndex(2))).toBe(36);
    expect(restored.isColumnHidden(2)).toBe(true);
    expect(restored.geometry().frozenRows).toBe(1);
    expect(restored.geometry().frozenCols).toBe(2);
  });

  it('ignores out-of-range snapshot entries', () => {
    const c = new GridController({ rowCount: 2, colCount: 2 });
    expect(() =>
      c.applyViewState({
        version: 1,
        columnWidths: { 0: 120, 99: 300 },
        rowHeights: { 1: 30, 42: 90 },
        hiddenColumns: [1, 9],
        hiddenRows: [0, 7],
        columnOrder: [9, 1],
        sort: [{ col: 8, direction: 'asc' }],
        frozenRows: 99,
        frozenCols: 99,
      }),
    ).not.toThrow();
    expect(c.getColumnWidth(0)).toBe(120);
    expect(c.getRowHeight(0)).toBe(30);
    expect(c.getColCount()).toBe(1);
    expect(c.getRowCount()).toBe(1);
    expect(c.captureViewState().columnOrder).toEqual([1, 0]);
    expect(c.captureViewState().sort).toBeUndefined();
    expect(c.geometry().frozenRows).toBe(2);
    expect(c.geometry().frozenCols).toBe(2);
  });

  it('emits viewstate for user view operations but not applyViewState', () => {
    const c = new GridController({ rowCount: 4, colCount: 4 });
    const listener = vi.fn();
    c.on('viewstate', listener);
    c.resizeCol(0, 120);
    c.resizeRow(0, 30);
    c.hideColumn(0);
    c.showColumn(0);
    c.hideColumn(0);
    c.showAllColumns();
    c.moveColumn(0, 2);
    c.toggleSort(0);
    c.clearView();
    expect(listener).toHaveBeenCalledTimes(9);
    c.applyViewState({ version: 1, columnWidths: { 1: 130 } });
    expect(listener).toHaveBeenCalledTimes(9);
  });

  it('sets physical column visibility and ignores out-of-range columns', () => {
    const c = new GridController({ rowCount: 4, colCount: 3 });
    const change = vi.fn();
    const viewstate = vi.fn();
    c.on('change', change);
    c.on('viewstate', viewstate);

    c.moveColumn(0, 2);
    c.setColumnVisible(0, false);
    expect(c.isColumnHidden(0)).toBe(true);
    expect(c.getColCount()).toBe(2);
    c.setColumnVisible(0, true);
    expect(c.isColumnHidden(0)).toBe(false);
    expect(c.getColCount()).toBe(3);

    c.setColumnVisible(-1, false);
    c.setColumnVisible(9, false);
    expect(change).toHaveBeenCalled();
    expect(viewstate).toHaveBeenCalledTimes(3);
  });

  it('sets and resets physical column widths', () => {
    const c = new GridController({ rowCount: 4, colCount: 3 });
    const change = vi.fn();
    const viewstate = vi.fn();
    c.on('change', change);
    c.on('viewstate', viewstate);
    c.moveColumn(0, 2);

    c.setColumnWidth(0, 150);
    expect(c.captureViewState().columnWidths).toEqual({ 0: 150 });
    expect(c.getColumnWidth(c.view.cols.getVisualIndex(0))).toBe(150);

    c.setColumnWidth(-1, 99);
    c.setColumnWidth(99, 99);
    expect(c.captureViewState().columnWidths).toEqual({ 0: 150 });

    c.resetColumnWidths();
    expect(c.captureViewState().columnWidths).toBeUndefined();
    expect(c.getColumnWidth(c.view.cols.getVisualIndex(0))).toBe(100);
    expect(change).toHaveBeenCalled();
    expect(viewstate).toHaveBeenCalledTimes(3);
  });

  it('uses present empty fields to reset that slice while omitted fields layer over prior state', () => {
    const c = new GridController({ rowCount: 3, colCount: 3 });
    c.resizeCol(0, 120);
    c.resizeRow(0, 32);
    c.hideColumn(1);
    c.moveColumn(0, 2);
    c.toggleSort(0);
    c.applyViewState({ version: 1, columnWidths: {}, rowHeights: {} });
    expect(c.getColumnWidth(c.view.cols.getVisualIndex(0))).toBe(100);
    expect(c.getRowHeight(0)).toBe(24);
    expect(c.isColumnHidden(1)).toBe(true);
    expect(c.captureViewState().sort).toEqual([{ col: 2, direction: 'asc' }]);
    c.applyViewState({ version: 1, hiddenColumns: [], columnOrder: [0, 1, 2], sort: [] });
    expect(c.getColCount()).toBe(3);
    expect(c.captureViewState().columnOrder).toBeUndefined();
    expect(c.captureViewState().sort).toBeUndefined();
  });
});

describe('header height APIs', () => {
  it('exposes the effective and base header heights', () => {
    const c = new GridController({ rowCount: 2, colCount: 2, colHeaderHeight: 30 });
    expect(c.getHeaderHeight()).toBe(30);
    expect(c.getBaseHeaderHeight()).toBe(30);
    expect(c.colHeaderHeight).toBe(30);
    expect(c.geometry().colHeaderHeight).toBe(30);
  });

  it('defaults the header height to 24', () => {
    const c = new GridController({ rowCount: 1, colCount: 1 });
    expect(c.getHeaderHeight()).toBe(24);
    expect(c.getBaseHeaderHeight()).toBe(24);
  });

  it('setHeaderHeight updates geometry, keeps the base, and emits change once', () => {
    const c = new GridController({ rowCount: 2, colCount: 2, colHeaderHeight: 30 });
    const onChange = vi.fn();
    c.on('change', onChange);
    c.setHeaderHeight(54);
    expect(c.getHeaderHeight()).toBe(54);
    expect(c.colHeaderHeight).toBe(54);
    expect(c.getBaseHeaderHeight()).toBe(30);
    expect(c.geometry().colHeaderHeight).toBe(54);
    expect(onChange).toHaveBeenCalledTimes(1);
    // Setting the same value again is a no-op.
    c.setHeaderHeight(54);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('column wrap & autoSizeRows', () => {
  /** Deterministic measurer: 7px per character, font-independent. */
  const measure = (text: string) => text.length * 7;

  it('sets and reads the wrap flag, emitting change', () => {
    const c = make();
    const listener = vi.fn();
    c.on('change', listener);
    expect(c.getColumnWrap(0)).toBe(false);
    expect(c.hasWrapColumns()).toBe(false);
    c.setColumnWrap(0, true);
    expect(c.getColumnWrap(0)).toBe(true);
    expect(c.hasWrapColumns()).toBe(true);
    c.setColumnWrap(0, false);
    expect(c.getColumnWrap(0)).toBe(false);
    expect(c.hasWrapColumns()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('applies wrap from rich column definitions', () => {
    const c = new GridController({ rowCount: 2, colCount: 3 });
    c.applyColumnDefs([
      { headerName: 'Note', wrap: true },
      { headerName: 'Off', wrap: false },
      { headerName: 'Unset' },
    ]);
    expect(c.getColumnWrap(0)).toBe(true);
    expect(c.getColumnWrap(1)).toBe(false);
    expect(c.getColumnWrap(2)).toBe(false);
    expect(c.hasWrapColumns()).toBe(true);
  });

  it('autoSizeRows is a silent no-op without wrap columns', () => {
    const c = new GridController({ rowCount: 3, colCount: 2 });
    c.setCellText(0, 0, 'some very long text that would wrap');
    const listener = vi.fn();
    c.on('change', listener);
    c.autoSizeRows({ measure, font: 'x', lineHeight: 20 });
    expect(c.getRowHeight(0)).toBe(24);
    expect(listener).not.toHaveBeenCalled();
  });

  it('sizes each row to its tallest wrapped block (one change event)', () => {
    const c = new GridController({ rowCount: 3, colCount: 2 });
    c.setColumnWrap(0, true);
    c.setColumnWrap(1, true);
    c.setColumnWidth(0, 50);
    c.setCellText(0, 0, 'foo bar baz'); // 50 - 12 = 38px → 3 lines
    c.setCellText(0, 1, 'a'); // wraps to 1 line — shorter candidate is ignored
    c.setCellText(1, 0, 'hi'); // 1 line, but 20 + 6 = 26 > default 24
    const listener = vi.fn();
    c.on('change', listener);
    c.autoSizeRows({ measure, font: 'x', lineHeight: 20 });
    expect(c.getRowHeight(0)).toBe(66); // 3 * 20 + paddingY 6
    expect(c.getRowHeight(1)).toBe(26); // 1 * 20 + 6
    expect(c.getRowHeight(2)).toBe(24); // empty → default min height
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('honors rows subset, paddings and minHeight', () => {
    const c = new GridController({ rowCount: 2, colCount: 1 });
    c.setColumnWrap(0, true);
    c.setColumnWidth(0, 50);
    c.setCellText(0, 0, 'foo bar baz');
    c.setCellText(1, 0, 'foo bar baz'); // 50 - 2 = 48px → "foo bar" 49 > 48 → 3 lines
    c.autoSizeRows({ measure, font: 'x', lineHeight: 10, paddingX: 1, paddingY: 0, minHeight: 40, rows: [1] });
    expect(c.getRowHeight(0)).toBe(24); // untouched — not in the subset
    expect(c.getRowHeight(1)).toBe(40); // 3 * 10 + 0 = 30, clamped to minHeight
  });

  it('grows past minHeight when the wrapped block is taller', () => {
    const c = new GridController({ rowCount: 1, colCount: 1 });
    c.setColumnWrap(0, true);
    c.setColumnWidth(0, 50);
    c.setCellText(0, 0, 'foo bar baz');
    c.autoSizeRows({ measure, font: 'x', lineHeight: 30, rows: [0] });
    expect(c.getRowHeight(0)).toBe(96); // 3 * 30 + 6 > default 24
  });
});

describe('display override', () => {
  it('replaces the painted text only — value, edit text, and copy are untouched', () => {
    const c = make();
    c.setCellText(0, 0, '=1+1');
    c.setCellText(0, 1, 'hello');
    c.setDisplayOverride((row, col, base) => (row === 0 && col === 0 ? `was ${base}` : null));
    expect(c.getDisplay(0, 0)).toBe('was 2');
    expect(c.getValue(0, 0)).toBe(2);
    expect(c.getEditText(0, 0)).toBe('=1+1');
    // Cells for which the override returns null keep the base display.
    expect(c.getDisplay(0, 1)).toBe('hello');
    c.selection.setActive({ row: 0, col: 0 });
    c.selection.extendTo({ row: 0, col: 1 });
    expect(c.copySelection()).toEqual([['=1+1', 'hello']]);
    // Editing starts from the stored text, not the overridden display.
    c.beginEdit(0, 0);
    expect(c.getEdit()?.draft).toBe('=1+1');
    c.cancelEdit();
  });

  it('receives physical coordinates and the formatted base display', () => {
    const c = make();
    c.setData([[3], [1], [2]]);
    c.setColumnFormat(0, '0.00');
    const seen: [number, number, string][] = [];
    c.setDisplayOverride((row, col, base) => {
      seen.push([row, col, base]);
      return null;
    });
    c.toggleSort(0); // ascending: visual row 0 → physical row 1
    seen.length = 0;
    expect(c.getDisplay(0, 0)).toBe('1.00');
    expect(seen).toEqual([[1, 0, '1.00']]);
    // Overrides layer on top of the column number format.
    c.setDisplayOverride((_row, _col, base) => `${base} kg`);
    expect(c.getDisplay(0, 0)).toBe('1.00 kg');
  });

  it('emits change on set and clear, and exposes the current override', () => {
    const c = make();
    c.setCellText(0, 0, 'x');
    const change = vi.fn();
    c.on('change', change);
    const fn = () => 'masked';
    c.setDisplayOverride(fn);
    expect(change).toHaveBeenCalledTimes(1);
    expect(c.getDisplayOverride()).toBe(fn);
    expect(c.getDisplay(0, 0)).toBe('masked');
    c.setDisplayOverride(null);
    expect(change).toHaveBeenCalledTimes(2);
    expect(c.getDisplayOverride()).toBeNull();
    expect(c.getDisplay(0, 0)).toBe('x');
  });
});

describe('GridController comments', () => {
  it('sets, reads, and deletes comments, emitting change on mutations only', () => {
    const c = new GridController({ rowCount: 3, colCount: 2 });
    let changes = 0;
    c.on('change', () => changes++);
    c.setComment(1, 1, 'check this');
    expect(changes).toBe(1);
    expect(c.getComment(1, 1)).toBe('check this');
    expect(c.hasComment(1, 1)).toBe(true);
    expect(c.getComment(0, 0)).toBeNull();
    expect(c.hasComment(0, 0)).toBe(false);
    expect(c.deleteComment(1, 1)).toBe(true);
    expect(changes).toBe(2);
    expect(c.getComment(1, 1)).toBeNull();
    // Deleting a missing comment is a no-op (no change event).
    expect(c.deleteComment(1, 1)).toBe(false);
    expect(changes).toBe(2);
  });

  it('removes a comment when set with empty text', () => {
    const c = new GridController({ rowCount: 2, colCount: 1 });
    c.setComment(0, 0, 'note');
    c.setComment(0, 0, '   ');
    expect(c.hasComment(0, 0)).toBe(false);
  });

  it('keys comments by physical cell so they follow sorted rows', () => {
    const c = new GridController({ rowCount: 3, colCount: 1 });
    c.setCellText(0, 0, '30');
    c.setCellText(1, 0, '10');
    c.setCellText(2, 0, '20');
    c.setComment(0, 0, 'top'); // physical row 0 (value 30)
    c.toggleSort(0); // asc: 10, 20, 30 → physical row 0 is now visual row 2
    expect(c.getComment(2, 0)).toBe('top');
    expect(c.hasComment(0, 0)).toBe(false);
    expect(c.comments.list()).toEqual([{ row: 0, col: 0, text: 'top' }]);
  });
});

describe('summary (footer) rows', () => {
  const seed = () => {
    const c = new GridController({ rowCount: 4, colCount: 3 });
    c.setData([
      ['Apple', 10, 100],
      ['Pear', 20, 200],
      ['Peach', 30, 300],
      ['Plum', 40, 400],
    ]);
    return c;
  };

  it('stores specs, reports the count, and emits change', () => {
    const c = seed();
    const onChange = vi.fn();
    c.on('change', onChange);
    c.setSummaryRows([{ label: '合計', cells: { 1: 'sum' } }]);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(c.getSummaryRowCount()).toBe(1);
    expect(c.getSummaryRows()[0]!.label).toBe('合計');
    c.setSummaryRows(null);
    expect(c.getSummaryRowCount()).toBe(0);
    expect(c.getSummaryRows()).toEqual([]);
  });

  it('exposes the band through geometry()', () => {
    const c = seed();
    expect(c.geometry().summaryRows).toBe(0);
    c.setSummaryRows([{ cells: {} }, { cells: {} }]);
    const g = c.geometry();
    expect(g.summaryRows).toBe(2);
    expect(g.summaryRowHeight).toBe(24);
  });

  it('computes built-in aggregates per column keyed by index', () => {
    const c = seed();
    c.setSummaryRows([{ cells: { 1: 'sum', 2: 'avg' } }]);
    expect(c.getSummaryDisplay(0, 1)).toBe('100');
    expect(c.getSummaryDisplay(0, 2)).toBe('250');
  });

  it('applies the column number format to aggregate results', () => {
    const c = seed();
    c.setColumnFormat(2, '#,##0');
    c.setSummaryRows([{ cells: { 2: 'sum' } }]);
    expect(c.getSummaryDisplay(0, 2)).toBe('1,000');
  });

  it('does not apply the column format to custom rules', () => {
    const c = seed();
    c.setColumnFormat(1, '#,##0.00');
    c.setSummaryRows([{ cells: { 1: (values) => `${values.length} rows` } }]);
    expect(c.getSummaryDisplay(0, 1)).toBe('4 rows');
  });

  it('resolves field-name keys through applied column defs', () => {
    const c = seed();
    c.applyColumnDefs([
      { headerName: 'Item', field: 'item' },
      { headerName: 'Qty', field: 'qty' },
      { headerName: 'Total', field: '' },
    ]);
    c.setSummaryRows([{ cells: { qty: 'max' } }]);
    expect(c.getSummaryDisplay(0, 1)).toBe('40');
    expect(c.getSummaryDisplay(0, 0)).toBe('');
  });

  it('ignores unresolvable keys (unknown fields and out-of-range indices)', () => {
    const c = seed();
    c.setSummaryRows([{ cells: { nope: 'sum', 99: 'sum' } }]);
    expect(c.getSummaryDisplay(0, 0)).toBe('');
    expect(c.getSummaryDisplay(0, 1)).toBe('');
    expect(c.getSummaryDisplay(0, 2)).toBe('');
  });

  it('shows the label in the first visible column by default', () => {
    const c = seed();
    c.setSummaryRows([{ label: 'Total', cells: { 1: 'sum' } }]);
    expect(c.getSummaryDisplay(0, 0)).toBe('Total');
    expect(c.getSummaryDisplay(0, 2)).toBe('');
  });

  it('shows the label in an explicit label column (index or field)', () => {
    const c = seed();
    c.applyColumnDefs([{ headerName: 'Item', field: 'item' }, { headerName: 'Qty', field: 'qty' }]);
    c.setSummaryRows([
      { label: 'ByIndex', labelCol: 2, cells: {} },
      { label: 'ByField', labelCol: 'item', cells: {} },
    ]);
    expect(c.getSummaryDisplay(0, 2)).toBe('ByIndex');
    expect(c.getSummaryDisplay(0, 0)).toBe('');
    expect(c.getSummaryDisplay(1, 0)).toBe('ByField');
    expect(c.getSummaryDisplay(1, 2)).toBe('');
  });

  it('falls back to the first column when the label column cannot resolve', () => {
    const c = seed();
    c.setSummaryRows([{ label: 'Fallback', labelCol: 99, cells: {} }]);
    expect(c.getSummaryDisplay(0, 0)).toBe('Fallback');
  });

  it('a cell rule beats the label on the same column', () => {
    const c = seed();
    c.setSummaryRows([{ label: 'Total', cells: { 0: 'count' } }]);
    expect(c.getSummaryDisplay(0, 0)).toBe('4');
  });

  it('returns empty text for an out-of-range summary row', () => {
    const c = seed();
    c.setSummaryRows([{ cells: {} }]);
    expect(c.getSummaryDisplay(5, 0)).toBe('');
  });

  it('aggregates only the filter-visible rows and tracks filter changes', () => {
    const c = seed();
    c.setSummaryRows([{ cells: { 1: 'sum' } }]);
    expect(c.getSummaryDisplay(0, 1)).toBe('100');
    c.setColumnFilter(1, [{ kind: 'gt', value: 15 }]);
    expect(c.getSummaryDisplay(0, 1)).toBe('90');
    c.clearView();
    expect(c.getSummaryDisplay(0, 1)).toBe('100');
  });

  it('recomputes after an edit commit', () => {
    const c = seed();
    c.setSummaryRows([{ cells: { 1: 'sum' } }]);
    c.beginEdit(0, 1, '50');
    c.commitEdit();
    expect(c.getSummaryDisplay(0, 1)).toBe('140');
  });

  it('follows column moves (visual indices) while keys stay physical', () => {
    const c = seed();
    c.setSummaryRows([{ cells: { 1: 'sum' } }]);
    c.moveColumn(1, 0);
    expect(c.getSummaryDisplay(0, 0)).toBe('100');
    expect(c.getSummaryDisplay(0, 1)).toBe('');
  });
});

describe('full-width input hardening (P1-1b)', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('normalizes full-width digits/comma/period on number columns by default', () => {
    const c = make();
    c.setColumnType(0, 'number');
    expect(c.getColumnFullWidthMode(0)).toBe('normalize');
    c.beginEdit(0, 0, '');
    c.updateDraft('１，２３４．５');
    expect(c.getEdit()?.draft).toBe('1,234.5');
    c.commitEdit();
    expect(c.getValue(0, 0)).toBe(1234.5);
  });

  it('normalizes at commit time when the draft was seeded via beginEdit', () => {
    const c = make();
    c.setColumnType(0, 'number');
    c.beginEdit(0, 0, '－１２３');
    c.commitEdit();
    expect(c.getValue(0, 0)).toBe(-123);
  });

  it('normalizes full-width colons for time columns ahead of the time pipeline', () => {
    const c = make();
    c.setColumnType(0, 'time');
    expect(c.getColumnFullWidthMode(0)).toBe('normalize');
    c.beginEdit(0, 0, '');
    c.updateDraft('９：３０');
    expect(c.getEdit()?.draft).toBe('9:30');
    c.commitEdit();
    expect(c.getEditText(0, 0)).toBe('09:30');
  });

  it('leaves text columns untouched (effective mode off outside number/time)', () => {
    const c = make();
    expect(c.getColumnFullWidthMode(0)).toBe('off');
    c.beginEdit(0, 0, '');
    c.updateDraft('１２３');
    expect(c.getEdit()?.draft).toBe('１２３');
    c.commitEdit();
    expect(c.getValue(0, 0)).toBe('１２３');
  });

  it("rejects full-width input under fullWidthMode 'reject' and emits inputreject", () => {
    const c = make();
    c.setColumnType(0, 'number');
    c.setColumnFullWidthMode(0, 'reject');
    expect(c.getColumnFullWidthMode(0)).toBe('reject');
    const rejects = vi.fn();
    const commits = vi.fn();
    const edits: unknown[] = [];
    c.on('inputreject', rejects);
    c.on('cellcommit', commits);
    c.on('edit', (e) => edits.push(e));
    c.setCellText(0, 0, '5');
    c.beginEdit(0, 0, '１２３');
    c.commitEdit();
    expect(rejects).toHaveBeenCalledWith({ row: 0, col: 0, raw: '１２３', reason: 'fullwidth' });
    expect(commits).not.toHaveBeenCalled();
    expect(c.getValue(0, 0)).toBe(5); // cell unchanged
    expect(c.getEdit()).toBeNull(); // edit session ended
    expect(edits.at(-1)).toBeNull();
  });

  it('reject mode still commits half-width input normally', () => {
    const c = make();
    c.setColumnType(0, 'number');
    c.setColumnFullWidthMode(0, 'reject');
    const rejects = vi.fn();
    c.on('inputreject', rejects);
    c.beginEdit(0, 0, '42');
    c.commitEdit();
    expect(rejects).not.toHaveBeenCalled();
    expect(c.getValue(0, 0)).toBe(42);
  });

  it("'off' disables handling so full-width text is stored as-is", () => {
    const c = make();
    c.setColumnType(0, 'number');
    c.setColumnFullWidthMode(0, 'off');
    c.beginEdit(0, 0, '');
    c.updateDraft('１２３');
    expect(c.getEdit()?.draft).toBe('１２３');
    c.commitEdit();
    expect(c.getValue(0, 0)).toBe('１２３');
  });

  it('clears an explicit mode back to the default with null', () => {
    const c = make();
    c.setColumnType(0, 'number');
    c.setColumnFullWidthMode(0, 'off');
    expect(c.getColumnFullWidthMode(0)).toBe('off');
    c.setColumnFullWidthMode(0, null);
    expect(c.getColumnFullWidthMode(0)).toBe('normalize');
  });

  it('wires fullWidthMode from column defs', () => {
    const c = make();
    c.applyColumnDefs([{ headerName: 'Qty', type: 'number', fullWidthMode: 'reject' }]);
    expect(c.getColumnFullWidthMode(0)).toBe('reject');
  });

  it('emits inputreject when a validator fails after commit (and not on success)', async () => {
    const c = make();
    c.setColumnValidator(0, (v) => typeof v === 'number' && v > 0);
    const rejects = vi.fn();
    c.on('inputreject', rejects);
    c.beginEdit(0, 0, '-3');
    c.commitEdit();
    await flush();
    expect(rejects).toHaveBeenCalledWith({ row: 0, col: 0, raw: '-3', reason: 'validator' });
    c.beginEdit(0, 0, '7');
    c.commitEdit();
    await flush();
    expect(rejects).toHaveBeenCalledTimes(1);
  });

  it('emits inputreject when a commitTransform refuses non-empty input', () => {
    const c = make();
    c.setColumnType(0, 'time');
    const rejects = vi.fn();
    c.on('inputreject', rejects);
    c.beginEdit(0, 0, '99:99');
    c.commitEdit();
    expect(rejects).toHaveBeenCalledWith({ row: 0, col: 0, raw: '99:99', reason: 'transform' });
    expect(c.getEditText(0, 0)).toBe('');
  });

  it('does not emit inputreject for an empty draft through a null transform', () => {
    const c = make();
    c.setColumnType(0, 'time');
    const rejects = vi.fn();
    c.on('inputreject', rejects);
    c.beginEdit(0, 0, '');
    c.commitEdit();
    expect(rejects).not.toHaveBeenCalled();
  });
});

describe('empty commit stores null / zero display (P1-1b)', () => {
  it('clearing a cell stores null (never ""), consistently across value and event', () => {
    const c = make();
    c.setCellText(0, 0, '42');
    const events: import('./controller.js').CellCommitEvent[] = [];
    c.on('cellcommit', (e) => events.push(e));
    c.beginEdit(0, 0);
    c.updateDraft('');
    c.commitEdit();
    expect(c.engine.getContent({ row: 0, col: 0 })).toBeNull(); // stored value is null
    expect(c.getValue(0, 0)).toBeNull();
    expect(c.getDisplay(0, 0)).toBe('');
    expect(events).toHaveLength(1);
    expect(events[0]!.changes).toEqual([
      { row: 0, col: 0, physicalRow: 0, physicalCol: 0, prev: '42', next: '' },
    ]);
  });

  it('renders 0 through a number format as "0.00", never blank', () => {
    const c = make();
    c.setColumnType(0, 'number');
    c.setColumnFormat(0, '0.00');
    c.beginEdit(0, 0, '0');
    c.commitEdit();
    expect(c.getValue(0, 0)).toBe(0);
    expect(c.getDisplay(0, 0)).toBe('0.00');
    c.beginEdit(0, 0, '０'); // full-width zero also lands as numeric 0
    c.commitEdit();
    expect(c.getValue(0, 0)).toBe(0);
    expect(c.getDisplay(0, 0)).toBe('0.00');
  });

  it('parses comma-grouped decimals like "1,234.5" on the commit path', () => {
    expect(parseNumberInput('1,234.5')).toBe(1234.5);
    const c = make();
    c.setColumnType(0, 'number');
    c.setColumnFormat(0, '#,##0.00');
    c.beginEdit(0, 0, '1,234.5');
    c.commitEdit();
    expect(c.getValue(0, 0)).toBe(1234.5);
    expect(c.getDisplay(0, 0)).toBe('1,234.50');
  });
});
