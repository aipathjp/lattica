import { describe, it, expect, vi } from 'vitest';

import { DataSource, type ColumnDef } from './data-source.js';

interface Person extends Record<string, unknown> {
  name: string;
  age: number;
  city: string;
}

const columns: ColumnDef<Person>[] = [
  { data: 'name', header: 'Name' },
  { data: 'age', header: 'Age' },
  { data: 'city' }, // no header -> falls back to key
];

function sampleData(): Person[] {
  return [
    { name: 'Alice', age: 30, city: 'Tokyo' },
    { name: 'Bob', age: 25, city: 'Osaka' },
    { name: 'Carol', age: 40, city: 'Kyoto' },
  ];
}

function make(): DataSource<Person> {
  return new DataSource<Person>({ data: sampleData(), columns });
}

describe('DataSource', () => {
  describe('construction & basic reads', () => {
    it('exposes counts and cells from the constructor data', () => {
      const ds = make();
      expect(ds.getRowCount()).toBe(3);
      expect(ds.getColCount()).toBe(3);
      expect(ds.getCell(0, 0)).toBe('Alice');
      expect(ds.getCell(1, 1)).toBe(25);
      expect(ds.getCell(2, 2)).toBe('Kyoto');
    });

    it('defaults to empty data when omitted', () => {
      const ds = new DataSource<Person>({ columns });
      expect(ds.getRowCount()).toBe(0);
      expect(ds.getColCount()).toBe(3);
      expect(ds.getData()).toEqual([]);
      expect(ds.getSourceData()).toEqual([]);
    });

    it('produces the full visible matrix in visual order', () => {
      const ds = make();
      expect(ds.getData()).toEqual([
        ['Alice', 30, 'Tokyo'],
        ['Bob', 25, 'Osaka'],
        ['Carol', 40, 'Kyoto'],
      ]);
    });
  });

  describe('headers', () => {
    it('returns the explicit header when present', () => {
      const ds = make();
      expect(ds.getColumnHeader(0)).toBe('Name');
      expect(ds.getColumnHeader(1)).toBe('Age');
    });

    it('falls back to the data key when no header is given', () => {
      const ds = make();
      expect(ds.getColumnHeader(2)).toBe('city');
    });

    it('returns empty string for an out-of-range column', () => {
      const ds = make();
      expect(ds.getColumnHeader(99)).toBe('');
    });

    it('tracks header through a column move', () => {
      const ds = make();
      // move column 0 (Name) to after the last visible column
      ds.cols.move(0, 1, 3);
      expect(ds.getColumnHeader(0)).toBe('Age');
      expect(ds.getColumnHeader(2)).toBe('Name');
    });
  });

  describe('loadData', () => {
    it('replaces data, resets row mapper length, and emits', () => {
      const ds = make();
      const listener = vi.fn();
      ds.subscribe(listener);

      const next: Person[] = [{ name: 'Dan', age: 50, city: 'Nara' }];
      ds.loadData(next);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(ds.getRowCount()).toBe(1);
      expect(ds.getCell(0, 0)).toBe('Dan');
      expect(ds.getSourceData()).toBe(next);
    });

    it('clears a previously-hidden row state by resetting the mapper', () => {
      const ds = make();
      ds.rows.setHidden([0], true);
      expect(ds.getRowCount()).toBe(2);

      ds.loadData(sampleData());
      expect(ds.getRowCount()).toBe(3);
      expect(ds.rows.isHidden(0)).toBe(false);
    });
  });

  describe('setCell', () => {
    it('writes back to the bound source object and emits', () => {
      const data = sampleData();
      const ds = new DataSource<Person>({ data, columns });
      const listener = vi.fn();
      ds.subscribe(listener);

      ds.setCell(0, 0, 'Alicia');

      expect(listener).toHaveBeenCalledTimes(1);
      expect(ds.getCell(0, 0)).toBe('Alicia');
      expect(data[0]!.name).toBe('Alicia'); // mutated the actual object
    });

    it('ignores writes to an out-of-range row (no emit)', () => {
      const ds = make();
      const listener = vi.fn();
      ds.subscribe(listener);
      ds.setCell(99, 0, 'x');
      expect(listener).not.toHaveBeenCalled();
      expect(ds.getData()).toEqual([
        ['Alice', 30, 'Tokyo'],
        ['Bob', 25, 'Osaka'],
        ['Carol', 40, 'Kyoto'],
      ]);
    });

    it('ignores writes to an out-of-range column (no emit)', () => {
      const ds = make();
      const listener = vi.fn();
      ds.subscribe(listener);
      ds.setCell(0, 99, 'x');
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('out-of-range gets return null', () => {
    it('returns null for an out-of-range row', () => {
      const ds = make();
      expect(ds.getCell(99, 0)).toBeNull();
    });

    it('returns null for an out-of-range column', () => {
      const ds = make();
      expect(ds.getCell(0, 99)).toBeNull();
    });

    it('returns null for negative indices', () => {
      const ds = make();
      expect(ds.getCell(-1, -1)).toBeNull();
    });
  });

  describe('column hiding reflected in output', () => {
    it('drops a hidden column from count and matrix', () => {
      const ds = make();
      ds.cols.setHidden([1], true); // hide Age

      expect(ds.getColCount()).toBe(2);
      expect(ds.getData()).toEqual([
        ['Alice', 'Tokyo'],
        ['Bob', 'Osaka'],
        ['Carol', 'Kyoto'],
      ]);
      // visual col 1 is now city
      expect(ds.getCell(0, 1)).toBe('Tokyo');
      expect(ds.getColumnHeader(1)).toBe('city');
    });
  });

  describe('row moving reflected in output', () => {
    it('reorders rows according to the row mapper', () => {
      const ds = make();
      // move row 2 (Carol) to the front
      ds.rows.move(2, 1, 0);

      expect(ds.getCell(0, 0)).toBe('Carol');
      expect(ds.getData()).toEqual([
        ['Carol', 40, 'Kyoto'],
        ['Alice', 30, 'Tokyo'],
        ['Bob', 25, 'Osaka'],
      ]);
    });
  });

  describe('round-trip', () => {
    it('getSourceData returns the same underlying objects after writes', () => {
      const data = sampleData();
      const ds = new DataSource<Person>({ data, columns });
      ds.setCell(1, 1, 99);
      const out = ds.getSourceData();
      expect(out).toBe(data);
      expect(out[1]!.age).toBe(99);
    });
  });

  describe('subscribe / unsubscribe', () => {
    it('stops notifying after unsubscribe', () => {
      const ds = make();
      const listener = vi.fn();
      const off = ds.subscribe(listener);

      ds.setCell(0, 0, 'X');
      expect(listener).toHaveBeenCalledTimes(1);

      off();
      ds.setCell(0, 0, 'Y');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('notifies multiple subscribers', () => {
      const ds = make();
      const a = vi.fn();
      const b = vi.fn();
      ds.subscribe(a);
      ds.subscribe(b);
      ds.loadData(sampleData());
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
    });
  });
});
