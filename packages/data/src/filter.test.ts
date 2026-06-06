import { describe, it, expect, vi } from 'vitest';

import {
  matchesCondition,
  filteredHiddenRows,
  FilterModel,
  type ColumnFilter,
} from './filter.js';

describe('matchesCondition', () => {
  describe('equals / notEquals', () => {
    it('equals matches on strict equality', () => {
      expect(matchesCondition(5, { kind: 'equals', value: 5 })).toBe(true);
      expect(matchesCondition('a', { kind: 'equals', value: 'a' })).toBe(true);
    });
    it('equals fails when not strictly equal (type-different)', () => {
      expect(matchesCondition('5', { kind: 'equals', value: 5 })).toBe(false);
      expect(matchesCondition(6, { kind: 'equals', value: 5 })).toBe(false);
    });
    it('notEquals matches when not strictly equal', () => {
      expect(matchesCondition(6, { kind: 'notEquals', value: 5 })).toBe(true);
    });
    it('notEquals fails when strictly equal', () => {
      expect(matchesCondition(5, { kind: 'notEquals', value: 5 })).toBe(false);
    });
  });

  describe('contains / notContains', () => {
    it('contains is case-insensitive and uses String(value)', () => {
      expect(matchesCondition('Hello World', { kind: 'contains', text: 'WORLD' })).toBe(true);
      expect(matchesCondition(12345, { kind: 'contains', text: '234' })).toBe(true);
    });
    it('contains fails when substring absent', () => {
      expect(matchesCondition('Hello', { kind: 'contains', text: 'xyz' })).toBe(false);
    });
    it('notContains matches when substring absent', () => {
      expect(matchesCondition('Hello', { kind: 'notContains', text: 'xyz' })).toBe(true);
    });
    it('notContains fails when substring present', () => {
      expect(matchesCondition('Hello', { kind: 'notContains', text: 'ell' })).toBe(false);
    });
  });

  describe('gt / gte / lt / lte', () => {
    it('gt matches strictly greater', () => {
      expect(matchesCondition(5, { kind: 'gt', value: 4 })).toBe(true);
    });
    it('gt fails when equal or less', () => {
      expect(matchesCondition(4, { kind: 'gt', value: 4 })).toBe(false);
    });
    it('gt fails on non-numeric cell', () => {
      expect(matchesCondition('abc', { kind: 'gt', value: 4 })).toBe(false);
    });
    it('gte matches greater-or-equal', () => {
      expect(matchesCondition(4, { kind: 'gte', value: 4 })).toBe(true);
      expect(matchesCondition(5, { kind: 'gte', value: 4 })).toBe(true);
    });
    it('gte fails when less', () => {
      expect(matchesCondition(3, { kind: 'gte', value: 4 })).toBe(false);
    });
    it('gte fails on non-numeric cell', () => {
      expect(matchesCondition('x', { kind: 'gte', value: 4 })).toBe(false);
    });
    it('lt matches strictly less', () => {
      expect(matchesCondition(3, { kind: 'lt', value: 4 })).toBe(true);
    });
    it('lt fails when equal or greater', () => {
      expect(matchesCondition(4, { kind: 'lt', value: 4 })).toBe(false);
    });
    it('lt fails on non-numeric cell', () => {
      expect(matchesCondition('x', { kind: 'lt', value: 4 })).toBe(false);
    });
    it('lte matches less-or-equal', () => {
      expect(matchesCondition(4, { kind: 'lte', value: 4 })).toBe(true);
      expect(matchesCondition(3, { kind: 'lte', value: 4 })).toBe(true);
    });
    it('lte fails when greater', () => {
      expect(matchesCondition(5, { kind: 'lte', value: 4 })).toBe(false);
    });
    it('lte fails on non-numeric cell', () => {
      expect(matchesCondition('x', { kind: 'lte', value: 4 })).toBe(false);
    });
    it('numeric conditions coerce numeric strings', () => {
      expect(matchesCondition('5', { kind: 'gt', value: 4 })).toBe(true);
    });
  });

  describe('between', () => {
    it('matches inclusive range', () => {
      expect(matchesCondition(5, { kind: 'between', min: 5, max: 10 })).toBe(true);
      expect(matchesCondition(10, { kind: 'between', min: 5, max: 10 })).toBe(true);
      expect(matchesCondition(7, { kind: 'between', min: 5, max: 10 })).toBe(true);
    });
    it('fails below min', () => {
      expect(matchesCondition(4, { kind: 'between', min: 5, max: 10 })).toBe(false);
    });
    it('fails above max', () => {
      expect(matchesCondition(11, { kind: 'between', min: 5, max: 10 })).toBe(false);
    });
    it('fails on non-numeric cell', () => {
      expect(matchesCondition('x', { kind: 'between', min: 5, max: 10 })).toBe(false);
    });
  });

  describe('empty / notEmpty', () => {
    it('empty matches null, undefined, empty string', () => {
      expect(matchesCondition(null, { kind: 'empty' })).toBe(true);
      expect(matchesCondition(undefined, { kind: 'empty' })).toBe(true);
      expect(matchesCondition('', { kind: 'empty' })).toBe(true);
    });
    it('empty fails on non-empty', () => {
      expect(matchesCondition('x', { kind: 'empty' })).toBe(false);
      expect(matchesCondition(0, { kind: 'empty' })).toBe(false);
    });
    it('notEmpty matches non-empty', () => {
      expect(matchesCondition('x', { kind: 'notEmpty' })).toBe(true);
      expect(matchesCondition(0, { kind: 'notEmpty' })).toBe(true);
    });
    it('notEmpty fails on empty', () => {
      expect(matchesCondition(null, { kind: 'notEmpty' })).toBe(false);
      expect(matchesCondition(undefined, { kind: 'notEmpty' })).toBe(false);
      expect(matchesCondition('', { kind: 'notEmpty' })).toBe(false);
    });
  });

  describe('in', () => {
    it('matches when value is in the list', () => {
      expect(matchesCondition('b', { kind: 'in', values: ['a', 'b', 'c'] })).toBe(true);
    });
    it('fails when value is not in the list', () => {
      expect(matchesCondition('z', { kind: 'in', values: ['a', 'b'] })).toBe(false);
    });
    it('uses strict equality (no coercion)', () => {
      expect(matchesCondition('5', { kind: 'in', values: [5] })).toBe(false);
    });
  });
});

describe('filteredHiddenRows', () => {
  // A small 2-column table: col 0 = name, col 1 = score.
  const rows: Array<[string, number | string]> = [
    ['alice', 10],
    ['bob', 20],
    ['carol', 30],
    ['dave', 'n/a'],
  ];
  const getValue = (r: number, c: number): unknown => rows[r]![c];

  it('returns [] when there are no filters', () => {
    expect(filteredHiddenRows(rows.length, getValue, [])).toEqual([]);
  });

  it('hides rows that fail a single condition', () => {
    const filters: ColumnFilter[] = [{ col: 1, conditions: [{ kind: 'gte', value: 20 }] }];
    // alice (10) fails, dave ('n/a' -> non-numeric) fails.
    expect(filteredHiddenRows(rows.length, getValue, filters)).toEqual([0, 3]);
  });

  it("combines a column's conditions with 'and' by default", () => {
    const filters: ColumnFilter[] = [
      { col: 1, conditions: [{ kind: 'gte', value: 10 }, { kind: 'lte', value: 20 }] },
    ];
    // keep alice(10), bob(20); hide carol(30), dave(n/a).
    expect(filteredHiddenRows(rows.length, getValue, filters)).toEqual([2, 3]);
  });

  it("combines a column's conditions with 'or' when requested", () => {
    const filters: ColumnFilter[] = [
      {
        col: 1,
        conjunction: 'or',
        conditions: [{ kind: 'lt', value: 15 }, { kind: 'gt', value: 25 }],
      },
    ];
    // keep alice(10<15), carol(30>25); hide bob(20), dave(n/a).
    expect(filteredHiddenRows(rows.length, getValue, filters)).toEqual([1, 3]);
  });

  it('hides a row that fails ANY of multiple column filters', () => {
    const filters: ColumnFilter[] = [
      { col: 0, conditions: [{ kind: 'contains', text: 'a' }] },
      { col: 1, conditions: [{ kind: 'gte', value: 20 }] },
    ];
    // col0 contains 'a': alice,carol,dave keep; bob fails.
    // col1 >= 20: bob,carol keep; alice,dave fail.
    // hidden = union of failures = alice(0), bob(1), dave(3).
    expect(filteredHiddenRows(rows.length, getValue, filters)).toEqual([0, 1, 3]);
  });

  it('treats a column filter with no conditions as vacuously satisfied', () => {
    const filters: ColumnFilter[] = [{ col: 1, conditions: [] }];
    expect(filteredHiddenRows(rows.length, getValue, filters)).toEqual([]);
  });

  it('handles a zero-row table', () => {
    const filters: ColumnFilter[] = [{ col: 1, conditions: [{ kind: 'gt', value: 0 }] }];
    expect(filteredHiddenRows(0, getValue, filters)).toEqual([]);
  });
});

describe('FilterModel', () => {
  const getValue = (r: number, c: number): unknown => {
    const data = [
      [1, 'x'],
      [2, 'y'],
      [3, 'z'],
    ];
    return data[r]![c];
  };

  it('set then apply hides failing rows', () => {
    const m = new FilterModel();
    m.set({ col: 0, conditions: [{ kind: 'gte', value: 2 }] });
    expect(m.apply(3, getValue)).toEqual([0]);
  });

  it('set replaces the filter for a column', () => {
    const m = new FilterModel();
    m.set({ col: 0, conditions: [{ kind: 'gte', value: 2 }] });
    m.set({ col: 0, conditions: [{ kind: 'gte', value: 3 }] });
    expect(m.getFilters()).toEqual([{ col: 0, conditions: [{ kind: 'gte', value: 3 }] }]);
    expect(m.apply(3, getValue)).toEqual([0, 1]);
  });

  it('getFilters returns filters sorted by column', () => {
    const m = new FilterModel();
    m.set({ col: 2, conditions: [{ kind: 'notEmpty' }] });
    m.set({ col: 0, conditions: [{ kind: 'gt', value: 0 }] });
    expect(m.getFilters().map((f) => f.col)).toEqual([0, 2]);
  });

  it('remove returns true when a filter existed', () => {
    const m = new FilterModel();
    m.set({ col: 0, conditions: [{ kind: 'gt', value: 0 }] });
    expect(m.remove(0)).toBe(true);
    expect(m.getFilters()).toEqual([]);
  });

  it('remove returns false when no filter existed', () => {
    const m = new FilterModel();
    expect(m.remove(5)).toBe(false);
  });

  it('clear removes all filters', () => {
    const m = new FilterModel();
    m.set({ col: 0, conditions: [{ kind: 'gt', value: 0 }] });
    m.set({ col: 1, conditions: [{ kind: 'notEmpty' }] });
    m.clear();
    expect(m.getFilters()).toEqual([]);
    expect(m.apply(3, getValue)).toEqual([]);
  });

  it('apply with no filters hides nothing', () => {
    const m = new FilterModel();
    expect(m.apply(3, getValue)).toEqual([]);
  });

  describe('subscribe', () => {
    it('notifies on set, remove, and clear', () => {
      const m = new FilterModel();
      const listener = vi.fn();
      m.subscribe(listener);
      m.set({ col: 0, conditions: [] });
      m.remove(0);
      m.clear();
      expect(listener).toHaveBeenCalledTimes(3);
    });

    it('stops notifying after unsubscribe', () => {
      const m = new FilterModel();
      const listener = vi.fn();
      const off = m.subscribe(listener);
      m.set({ col: 0, conditions: [] });
      off();
      m.set({ col: 1, conditions: [] });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('supports multiple subscribers', () => {
      const m = new FilterModel();
      const a = vi.fn();
      const b = vi.fn();
      m.subscribe(a);
      m.subscribe(b);
      m.clear();
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
    });
  });
});
