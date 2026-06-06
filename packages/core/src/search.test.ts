import { describe, it, expect, vi } from 'vitest';
import { searchGrid, SearchState } from './search.js';
import type { SearchMatch } from './search.js';

/** Build a getText accessor from a 2D string array. */
function gridAccessor(rows: readonly (readonly string[])[]): (r: number, c: number) => string {
  return (r, c) => rows[r]![c]!;
}

describe('searchGrid', () => {
  const rows = [
    ['Apple', 'banana', 'Cherry'],
    ['apricot', 'BANANA', 'date'],
  ];
  const get = gridAccessor(rows);

  it('returns [] for an empty query', () => {
    expect(searchGrid(2, 3, get, '')).toEqual([]);
  });

  it('matches substring case-insensitively by default', () => {
    expect(searchGrid(2, 3, get, 'banana')).toEqual<SearchMatch[]>([
      { row: 0, col: 1 },
      { row: 1, col: 1 },
    ]);
  });

  it('scans in row-major order', () => {
    // "a" appears in many cells; verify ordering is row-then-col.
    const result = searchGrid(2, 3, get, 'a');
    expect(result).toEqual<SearchMatch[]>([
      { row: 0, col: 0 }, // Apple
      { row: 0, col: 1 }, // banana
      { row: 1, col: 0 }, // apricot
      { row: 1, col: 1 }, // BANANA
      { row: 1, col: 2 }, // date
    ]);
  });

  it('matches substring case-sensitively when requested', () => {
    expect(searchGrid(2, 3, get, 'BANANA', { caseSensitive: true })).toEqual<SearchMatch[]>([
      { row: 1, col: 1 },
    ]);
    expect(searchGrid(2, 3, get, 'banana', { caseSensitive: true })).toEqual<SearchMatch[]>([
      { row: 0, col: 1 },
    ]);
  });

  it('returns [] when there are no matches', () => {
    expect(searchGrid(2, 3, get, 'zzz')).toEqual([]);
  });

  it('matches whole cell only (case-insensitive)', () => {
    expect(searchGrid(2, 3, get, 'apple', { wholeCell: true })).toEqual<SearchMatch[]>([
      { row: 0, col: 0 },
    ]);
    // substring would match but whole-cell should not
    expect(searchGrid(2, 3, get, 'app', { wholeCell: true })).toEqual([]);
  });

  it('matches whole cell case-sensitively', () => {
    expect(searchGrid(2, 3, get, 'Apple', { wholeCell: true, caseSensitive: true })).toEqual<
      SearchMatch[]
    >([{ row: 0, col: 0 }]);
    expect(
      searchGrid(2, 3, get, 'apple', { wholeCell: true, caseSensitive: true }),
    ).toEqual([]);
  });

  it('matches with a valid regex (case-insensitive)', () => {
    expect(searchGrid(2, 3, get, '^a.+e$', { regex: true })).toEqual<SearchMatch[]>([
      { row: 0, col: 0 }, // Apple
    ]);
  });

  it('matches with a valid regex case-sensitively', () => {
    expect(searchGrid(2, 3, get, 'BANANA', { regex: true, caseSensitive: true })).toEqual<
      SearchMatch[]
    >([{ row: 1, col: 1 }]);
  });

  it('anchors regex when wholeCell is set', () => {
    // "an" appears inside banana but is not the whole cell.
    expect(searchGrid(2, 3, get, 'an', { regex: true, wholeCell: true })).toEqual([]);
    expect(searchGrid(2, 3, get, 'date', { regex: true, wholeCell: true })).toEqual<
      SearchMatch[]
    >([{ row: 1, col: 2 }]);
  });

  it('treats an invalid regex as no matches without throwing', () => {
    expect(() => searchGrid(2, 3, get, '(', { regex: true })).not.toThrow();
    expect(searchGrid(2, 3, get, '(', { regex: true })).toEqual([]);
    // invalid regex with wholeCell too
    expect(searchGrid(2, 3, get, '[', { regex: true, wholeCell: true })).toEqual([]);
  });

  it('handles a zero-sized grid', () => {
    expect(searchGrid(0, 0, get, 'a')).toEqual([]);
  });
});

describe('SearchState', () => {
  const m = (row: number, col: number): SearchMatch => ({ row, col });

  it('starts empty', () => {
    const s = new SearchState();
    expect(s.count).toBe(0);
    expect(s.activeIndex).toBe(-1);
    expect(s.current()).toBeNull();
  });

  it('setMatches resets the cursor to 0', () => {
    const s = new SearchState();
    s.setMatches([m(0, 0), m(1, 1), m(2, 2)]);
    expect(s.count).toBe(3);
    expect(s.activeIndex).toBe(0);
    expect(s.current()).toEqual(m(0, 0));
  });

  it('setMatches with empty list resets to -1', () => {
    const s = new SearchState();
    s.setMatches([m(0, 0)]);
    s.setMatches([]);
    expect(s.count).toBe(0);
    expect(s.activeIndex).toBe(-1);
    expect(s.current()).toBeNull();
  });

  it('copies the provided match array (no aliasing)', () => {
    const s = new SearchState();
    const input = [m(0, 0)];
    s.setMatches(input);
    input.push(m(9, 9));
    expect(s.count).toBe(1);
  });

  it('next cycles forward and wraps', () => {
    const s = new SearchState();
    s.setMatches([m(0, 0), m(1, 1), m(2, 2)]);
    expect(s.next()).toEqual(m(1, 1));
    expect(s.activeIndex).toBe(1);
    expect(s.next()).toEqual(m(2, 2));
    expect(s.next()).toEqual(m(0, 0)); // wrap
    expect(s.activeIndex).toBe(0);
  });

  it('prev cycles backward and wraps', () => {
    const s = new SearchState();
    s.setMatches([m(0, 0), m(1, 1), m(2, 2)]);
    expect(s.prev()).toEqual(m(2, 2)); // wrap from 0
    expect(s.activeIndex).toBe(2);
    expect(s.prev()).toEqual(m(1, 1));
    expect(s.prev()).toEqual(m(0, 0));
  });

  it('next/prev return null with no matches', () => {
    const s = new SearchState();
    expect(s.next()).toBeNull();
    expect(s.prev()).toBeNull();
    expect(s.activeIndex).toBe(-1);
  });

  it('current returns the active match', () => {
    const s = new SearchState();
    s.setMatches([m(0, 0), m(1, 1)]);
    expect(s.current()).toEqual(m(0, 0));
    s.next();
    expect(s.current()).toEqual(m(1, 1));
  });

  it('clear drops matches and resets cursor', () => {
    const s = new SearchState();
    s.setMatches([m(0, 0), m(1, 1)]);
    s.clear();
    expect(s.count).toBe(0);
    expect(s.activeIndex).toBe(-1);
    expect(s.current()).toBeNull();
  });

  it('notifies subscribers on setMatches/next/prev/clear', () => {
    const s = new SearchState();
    const listener = vi.fn();
    s.subscribe(listener);
    s.setMatches([m(0, 0), m(1, 1)]);
    s.next();
    s.prev();
    s.clear();
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('unsubscribe stops notifications', () => {
    const s = new SearchState();
    const listener = vi.fn();
    const off = s.subscribe(listener);
    off();
    s.setMatches([m(0, 0)]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('allows a listener to unsubscribe during notification', () => {
    const s = new SearchState();
    const calls: string[] = [];
    let offB: () => void = () => {};
    const a = (): void => {
      calls.push('a');
      offB();
    };
    const b = (): void => {
      calls.push('b');
    };
    s.subscribe(a);
    offB = s.subscribe(b);
    s.setMatches([m(0, 0)]); // b still runs this round (snapshot)
    s.next();
    expect(calls.filter((c) => c === 'a')).toHaveLength(2);
    expect(calls.filter((c) => c === 'b')).toHaveLength(1);
  });
});
