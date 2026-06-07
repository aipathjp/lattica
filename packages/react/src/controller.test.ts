import { describe, it, expect, vi } from 'vitest';
import { GridController, formatValue, replaceInText } from './controller.js';
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
