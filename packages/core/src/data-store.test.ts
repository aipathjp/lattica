import { describe, it, expect, vi } from 'vitest';
import { DataStore } from './data-store.js';

const make = (r = 10, c = 10) => new DataStore({ rowCount: r, colCount: c });

describe('DataStore construction', () => {
  it('rejects negative dimensions', () => {
    expect(() => new DataStore({ rowCount: -1, colCount: 5 })).toThrow(RangeError);
    expect(() => new DataStore({ rowCount: 5, colCount: -1 })).toThrow(RangeError);
  });
  it('exposes dimensions', () => {
    const s = make(3, 4);
    expect(s.getRowCount()).toBe(3);
    expect(s.getColCount()).toBe(4);
  });
});

describe('get/set', () => {
  it('returns null for empty cells', () => {
    expect(make().get({ row: 0, col: 0 })).toBeNull();
  });
  it('stores and reads values', () => {
    const s = make();
    s.set({ row: 1, col: 2 }, 'hi');
    expect(s.get({ row: 1, col: 2 })).toBe('hi');
    expect(s.populatedCount).toBe(1);
  });
  it('deletes the cell when set to null', () => {
    const s = make();
    s.set({ row: 0, col: 0 }, 5);
    s.set({ row: 0, col: 0 }, null);
    expect(s.get({ row: 0, col: 0 })).toBeNull();
    expect(s.populatedCount).toBe(0);
  });
  it('throws on out-of-bounds access', () => {
    const s = make(2, 2);
    expect(() => s.get({ row: 2, col: 0 })).toThrow(RangeError);
    expect(() => s.set({ row: 0, col: 2 }, 1)).toThrow(RangeError);
    expect(() => s.get({ row: -1, col: 0 })).toThrow(RangeError);
  });
});

describe('change notifications', () => {
  it('emits batched changes with previous/next', () => {
    const s = make();
    const listener = vi.fn();
    s.subscribe(listener);
    s.setMany([
      { address: { row: 0, col: 0 }, value: 1 },
      { address: { row: 0, col: 1 }, value: 2 },
    ]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]![0]).toEqual([
      { row: 0, col: 0, previous: null, next: 1 },
      { row: 0, col: 1, previous: null, next: 2 },
    ]);
  });

  it('does not emit when value is unchanged', () => {
    const s = make();
    s.set({ row: 0, col: 0 }, 7);
    const listener = vi.fn();
    s.subscribe(listener);
    s.set({ row: 0, col: 0 }, 7);
    expect(listener).not.toHaveBeenCalled();
  });

  it('unsubscribes', () => {
    const s = make();
    const listener = vi.fn();
    const off = s.subscribe(listener);
    off();
    s.set({ row: 0, col: 0 }, 1);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('forEachPopulated', () => {
  it('visits every populated cell', () => {
    const s = make();
    s.set({ row: 1, col: 1 }, 'a');
    s.set({ row: 9, col: 8 }, 'b');
    const seen = new Map<string, unknown>();
    s.forEachPopulated((addr, v) => seen.set(`${addr.row},${addr.col}`, v));
    expect(seen.get('1,1')).toBe('a');
    expect(seen.get('9,8')).toBe('b');
    expect(seen.size).toBe(2);
  });
});

describe('resize', () => {
  it('rejects negative dimensions', () => {
    expect(() => make().resize(-1, 5)).toThrow(RangeError);
  });
  it('drops cells outside shrunk bounds and emits null changes', () => {
    const s = make(10, 10);
    s.set({ row: 8, col: 8 }, 'x');
    s.set({ row: 1, col: 1 }, 'keep');
    const listener = vi.fn();
    s.subscribe(listener);
    s.resize(5, 5);
    expect(s.getRowCount()).toBe(5);
    expect(s.populatedCount).toBe(1);
    expect(s.get({ row: 1, col: 1 })).toBe('keep');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]![0]).toEqual([
      { row: 8, col: 8, previous: 'x', next: null },
    ]);
  });
  it('grows without dropping cells or emitting', () => {
    const s = make(5, 5);
    s.set({ row: 1, col: 1 }, 'v');
    const listener = vi.fn();
    s.subscribe(listener);
    s.resize(20, 20);
    expect(s.getRowCount()).toBe(20);
    expect(s.get({ row: 1, col: 1 })).toBe('v');
    expect(listener).not.toHaveBeenCalled();
  });
});
