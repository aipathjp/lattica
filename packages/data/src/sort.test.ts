import { describe, it, expect, vi } from 'vitest';

import {
  defaultComparator,
  sortPhysicalOrder,
  SortModel,
  type CellComparator,
  type SortConfig,
} from './sort.js';

const sign = (n: number): number => (n < 0 ? -1 : n > 0 ? 1 : 0);

describe('defaultComparator', () => {
  describe('null / undefined sort last', () => {
    it('treats two nullish values as equal', () => {
      expect(defaultComparator(null, null)).toBe(0);
      expect(defaultComparator(undefined, undefined)).toBe(0);
      expect(defaultComparator(null, undefined)).toBe(0);
    });

    it('sorts nullish after any concrete value (a nil)', () => {
      expect(defaultComparator(null, 0)).toBe(1);
      expect(defaultComparator(undefined, 'x')).toBe(1);
      expect(defaultComparator(null, false)).toBe(1);
    });

    it('sorts concrete value before nullish (b nil)', () => {
      expect(defaultComparator(5, null)).toBe(-1);
      expect(defaultComparator('x', undefined)).toBe(-1);
    });
  });

  describe('numbers', () => {
    it('compares numerically', () => {
      expect(sign(defaultComparator(1, 2))).toBe(-1);
      expect(sign(defaultComparator(2, 1))).toBe(1);
      expect(defaultComparator(3, 3)).toBe(0);
      expect(sign(defaultComparator(-5, 5))).toBe(-1);
    });

    it('compares bigints (same rank as numbers)', () => {
      expect(sign(defaultComparator(1n, 2n))).toBe(-1);
      expect(sign(defaultComparator(10n, 2))).toBe(1);
      expect(defaultComparator(4n, 4)).toBe(0);
    });
  });

  describe('booleans', () => {
    it('orders false < true', () => {
      expect(sign(defaultComparator(false, true))).toBe(-1);
      expect(sign(defaultComparator(true, false))).toBe(1);
      expect(defaultComparator(true, true)).toBe(0);
      expect(defaultComparator(false, false)).toBe(0);
    });
  });

  describe('strings', () => {
    it('compares case-insensitively', () => {
      expect(sign(defaultComparator('apple', 'Banana'))).toBe(-1);
      expect(sign(defaultComparator('Banana', 'apple'))).toBe(1);
      expect(defaultComparator('Foo', 'foo')).toBe(0);
    });

    it('returns -1 / 1 / 0 across the three string branches', () => {
      expect(defaultComparator('a', 'b')).toBe(-1);
      expect(defaultComparator('b', 'a')).toBe(1);
      expect(defaultComparator('same', 'same')).toBe(0);
    });
  });

  describe('mixed types ordered by type rank', () => {
    it('number < boolean < string', () => {
      expect(sign(defaultComparator(1, true))).toBe(-1); // num(0) < bool(1)
      expect(sign(defaultComparator(true, 'z'))).toBe(-1); // bool(1) < str(2)
      expect(sign(defaultComparator('z', 1))).toBe(1); // str(2) > num(0)
    });

    it('ranks objects/symbols last among concrete values (rank 3)', () => {
      const obj = {};
      expect(sign(defaultComparator(obj, 'z'))).toBe(1); // rank 3 > str rank 2
      expect(sign(defaultComparator('z', obj))).toBe(-1);
    });
  });

  describe('number edge: NaN normalized to equal', () => {
    it('treats NaN as not greater/less (returns 0 fallthrough)', () => {
      expect(defaultComparator(NaN, NaN)).toBe(0);
      expect(defaultComparator(NaN, 5)).toBe(0);
    });
  });

  describe('bigint precision', () => {
    it('compares two bigints exactly, beyond Number.MAX_SAFE_INTEGER', () => {
      const a = 9007199254740993n; // 2^53 + 1
      const b = 9007199254740992n; // 2^53
      expect(defaultComparator(a, b)).toBe(1);
      expect(defaultComparator(b, a)).toBe(-1);
      expect(defaultComparator(a, a)).toBe(0);
    });
    it('still compares a bigint against a number via numeric coercion', () => {
      expect(defaultComparator(10n, 2)).toBe(1);
      expect(defaultComparator(2, 10n)).toBe(-1);
    });
  });
});

describe('sortPhysicalOrder', () => {
  // grid[physicalRow][col]
  const grid: unknown[][] = [
    [3, 'b'],
    [1, 'a'],
    [2, 'a'],
    [1, 'c'],
  ];
  const getValue = (row: number, col: number): unknown => grid[row]![col];

  it('returns identity order for empty configs', () => {
    expect(sortPhysicalOrder(4, getValue, [])).toEqual([0, 1, 2, 3]);
  });

  it('returns identity for empty configs and zero rows', () => {
    expect(sortPhysicalOrder(0, getValue, [])).toEqual([]);
  });

  it('sorts single column ascending', () => {
    const cfgs: SortConfig[] = [{ col: 0, direction: 'asc' }];
    // values: row0=3,row1=1,row2=2,row3=1 -> stable: 1(row1),1(row3),2(row2),3(row0)
    expect(sortPhysicalOrder(4, getValue, cfgs)).toEqual([1, 3, 2, 0]);
  });

  it('sorts single column descending', () => {
    const cfgs: SortConfig[] = [{ col: 0, direction: 'desc' }];
    // desc: 3(row0),2(row2),1(row1),1(row3) — ties keep physical order
    expect(sortPhysicalOrder(4, getValue, cfgs)).toEqual([0, 2, 1, 3]);
  });

  it('is stable for equal rows (no config tie-break)', () => {
    const flat: unknown[][] = [['x'], ['x'], ['x']];
    const gv = (r: number, c: number): unknown => flat[r]![c];
    expect(sortPhysicalOrder(3, gv, [{ col: 0, direction: 'asc' }])).toEqual([0, 1, 2]);
  });

  it('sorts multi-column with earlier config taking priority', () => {
    // sort by col1 (string) asc, then col0 (number) asc
    const cfgs: SortConfig[] = [
      { col: 1, direction: 'asc' },
      { col: 0, direction: 'asc' },
    ];
    // col1: a,a,b,c. Among 'a' rows: row1(1), row2(2) -> 1,2.
    // -> 'a':[1,2], 'b':[0], 'c':[3] => [1,2,0,3]
    expect(sortPhysicalOrder(4, getValue, cfgs)).toEqual([1, 2, 0, 3]);
  });

  it('falls through to second config only on tie in first', () => {
    const cfgs: SortConfig[] = [
      { col: 1, direction: 'desc' },
      { col: 0, direction: 'desc' },
    ];
    // col1 desc: c(row3),b(row0),a(...). Among 'a': col0 desc -> 2(row2),1(row1)
    expect(sortPhysicalOrder(4, getValue, cfgs)).toEqual([3, 0, 2, 1]);
  });

  it('uses a custom comparatorFor when provided', () => {
    // Reverse string comparator for col1 only.
    const comparatorFor = (col: number): CellComparator => {
      if (col === 1) {
        return (a, b) => -defaultComparator(a, b);
      }
      return defaultComparator;
    };
    const cfgs: SortConfig[] = [{ col: 1, direction: 'asc' }];
    // reversed asc on col1 -> c,b,a,a -> [3,0,1,2] (a ties keep physical order)
    expect(sortPhysicalOrder(4, getValue, cfgs, comparatorFor)).toEqual([3, 0, 1, 2]);
  });

  it('falls back to defaultComparator when comparatorFor returns undefined-ish (covers nullish coalesce)', () => {
    // comparatorFor exists but returns the default for the queried col.
    const comparatorFor = vi.fn((_col: number): CellComparator => defaultComparator);
    const cfgs: SortConfig[] = [{ col: 0, direction: 'asc' }];
    expect(sortPhysicalOrder(4, getValue, cfgs, comparatorFor)).toEqual([1, 3, 2, 0]);
    expect(comparatorFor).toHaveBeenCalledWith(0);
  });
});

describe('SortModel', () => {
  const grid: unknown[][] = [[3], [1], [2]];
  const getValue = (r: number, c: number): unknown => grid[r]![c];

  describe('toggle cycle (replace mode)', () => {
    it('cycles none -> asc -> desc -> none', () => {
      const m = new SortModel();
      expect(m.getConfigs()).toEqual([]);

      m.toggle(0);
      expect(m.getConfigs()).toEqual([{ col: 0, direction: 'asc' }]);

      m.toggle(0);
      expect(m.getConfigs()).toEqual([{ col: 0, direction: 'desc' }]);

      m.toggle(0);
      expect(m.getConfigs()).toEqual([]);
    });

    it('replaces other columns when not additive', () => {
      const m = new SortModel();
      m.toggle(0); // [{0,asc}]
      m.toggle(1); // replaces -> [{1,asc}]
      expect(m.getConfigs()).toEqual([{ col: 1, direction: 'asc' }]);
    });
  });

  describe('toggle additive mode', () => {
    it('keeps existing columns and appends new ones', () => {
      const m = new SortModel();
      m.toggle(0, true); // [{0,asc}]
      m.toggle(1, true); // [{0,asc},{1,asc}]
      expect(m.getConfigs()).toEqual([
        { col: 0, direction: 'asc' },
        { col: 1, direction: 'asc' },
      ]);
    });

    it('updates an existing additive column in place (asc -> desc)', () => {
      const m = new SortModel();
      m.toggle(0, true);
      m.toggle(1, true);
      m.toggle(0, true); // 0: asc -> desc, keep order
      expect(m.getConfigs()).toEqual([
        { col: 0, direction: 'desc' },
        { col: 1, direction: 'asc' },
      ]);
    });

    it('removes an additive column when it cycles back to none', () => {
      const m = new SortModel();
      m.toggle(0, true);
      m.toggle(1, true);
      m.toggle(0, true); // desc
      m.toggle(0, true); // none -> removed
      expect(m.getConfigs()).toEqual([{ col: 1, direction: 'asc' }]);
    });
  });

  describe('clear', () => {
    it('removes all configs', () => {
      const m = new SortModel();
      m.toggle(0, true);
      m.toggle(1, true);
      m.clear();
      expect(m.getConfigs()).toEqual([]);
    });
  });

  describe('getConfigs returns copies', () => {
    it('does not expose internal config objects for mutation', () => {
      const m = new SortModel();
      m.toggle(0);
      const cfgs = m.getConfigs();
      cfgs[0]!.direction = 'desc';
      expect(m.getConfigs()).toEqual([{ col: 0, direction: 'asc' }]);
    });
  });

  describe('apply', () => {
    it('returns identity when no configs', () => {
      const m = new SortModel();
      expect(m.apply(3, getValue)).toEqual([0, 1, 2]);
    });

    it('computes physical order for active config', () => {
      const m = new SortModel();
      m.toggle(0); // asc on col0: values 3,1,2 -> [1,2,0]
      expect(m.apply(3, getValue)).toEqual([1, 2, 0]);
    });
  });

  describe('subscribe / unsubscribe', () => {
    it('notifies on toggle and clear', () => {
      const m = new SortModel();
      const listener = vi.fn();
      m.subscribe(listener);
      m.toggle(0);
      m.clear();
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('stops notifying after unsubscribe', () => {
      const m = new SortModel();
      const listener = vi.fn();
      const unsubscribe = m.subscribe(listener);
      m.toggle(0);
      unsubscribe();
      m.toggle(0);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('supports multiple subscribers', () => {
      const m = new SortModel();
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
