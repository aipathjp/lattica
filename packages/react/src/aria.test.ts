import { describe, it, expect } from 'vitest';
import { gridAria, rowAria, cellAria, columnHeaderAria, rowHeaderAria } from './aria.js';

describe('gridAria', () => {
  it('emits role and counts', () => {
    expect(gridAria(100, 26)).toEqual({
      role: 'grid',
      'aria-rowcount': 100,
      'aria-colcount': 26,
    });
  });
});

describe('rowAria', () => {
  it('emits a 1-based row index', () => {
    expect(rowAria(0)).toEqual({ role: 'row', 'aria-rowindex': 1 });
    expect(rowAria(41)).toEqual({ role: 'row', 'aria-rowindex': 42 });
  });
});

describe('cellAria', () => {
  it('emits 1-based row/col indices with no opts', () => {
    expect(cellAria(0, 0)).toEqual({
      role: 'gridcell',
      'aria-rowindex': 1,
      'aria-colindex': 1,
    });
    expect(cellAria(2, 3)).toMatchObject({
      'aria-rowindex': 3,
      'aria-colindex': 4,
    });
  });

  it('omits selected/readonly when opts is empty', () => {
    const attrs = cellAria(1, 1, {});
    expect(attrs['aria-selected']).toBeUndefined();
    expect(attrs['aria-readonly']).toBeUndefined();
  });

  it('emits aria-selected when selected is true', () => {
    expect(cellAria(0, 0, { selected: true })['aria-selected']).toBe(true);
  });

  it('emits aria-selected when selected is false', () => {
    expect(cellAria(0, 0, { selected: false })['aria-selected']).toBe(false);
  });

  it('emits aria-readonly when readonly is true', () => {
    expect(cellAria(0, 0, { readonly: true })['aria-readonly']).toBe(true);
  });

  it('emits aria-readonly when readonly is false', () => {
    expect(cellAria(0, 0, { readonly: false })['aria-readonly']).toBe(false);
  });

  it('emits both selected and readonly together', () => {
    expect(cellAria(5, 6, { selected: true, readonly: true })).toEqual({
      role: 'gridcell',
      'aria-rowindex': 6,
      'aria-colindex': 7,
      'aria-selected': true,
      'aria-readonly': true,
    });
  });
});

describe('columnHeaderAria', () => {
  it('defaults aria-sort to none when omitted', () => {
    expect(columnHeaderAria(0)).toEqual({
      role: 'columnheader',
      'aria-colindex': 1,
      'aria-sort': 'none',
    });
  });

  it('defaults aria-sort to none when opts has no sort', () => {
    expect(columnHeaderAria(1, {})['aria-sort']).toBe('none');
  });

  it('emits aria-sort asc', () => {
    expect(columnHeaderAria(0, { sort: 'asc' })['aria-sort']).toBe('asc');
  });

  it('emits aria-sort desc', () => {
    expect(columnHeaderAria(0, { sort: 'desc' })['aria-sort']).toBe('desc');
  });

  it('emits aria-sort none explicitly', () => {
    expect(columnHeaderAria(3, { sort: 'none' })).toEqual({
      role: 'columnheader',
      'aria-colindex': 4,
      'aria-sort': 'none',
    });
  });
});

describe('rowHeaderAria', () => {
  it('emits a 1-based row index', () => {
    expect(rowHeaderAria(0)).toEqual({ role: 'rowheader', 'aria-rowindex': 1 });
    expect(rowHeaderAria(9)).toEqual({ role: 'rowheader', 'aria-rowindex': 10 });
  });
});
