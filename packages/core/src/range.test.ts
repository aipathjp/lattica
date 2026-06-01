import { describe, it, expect } from 'vitest';
import {
  normalizeRange,
  singleCell,
  rangeContains,
  rangeArea,
  rangesIntersect,
  rangeUnion,
  forEachCell,
  clampRange,
} from './range.js';

const r = (r0: number, c0: number, r1: number, c1: number) => ({
  start: { row: r0, col: c0 },
  end: { row: r1, col: c1 },
});

describe('normalizeRange', () => {
  it('canonicalizes any corner orientation', () => {
    expect(normalizeRange(r(5, 5, 1, 1))).toEqual({ top: 1, left: 1, bottom: 5, right: 5 });
    expect(normalizeRange(r(1, 5, 5, 1))).toEqual({ top: 1, left: 1, bottom: 5, right: 5 });
  });
});

describe('singleCell', () => {
  it('builds a 1x1 range', () => {
    expect(rangeArea(singleCell({ row: 3, col: 4 }))).toBe(1);
  });
});

describe('rangeContains', () => {
  it('tests membership', () => {
    const range = r(1, 1, 3, 3);
    expect(rangeContains(range, { row: 2, col: 2 })).toBe(true);
    expect(rangeContains(range, { row: 1, col: 1 })).toBe(true);
    expect(rangeContains(range, { row: 3, col: 3 })).toBe(true);
    expect(rangeContains(range, { row: 0, col: 2 })).toBe(false);
    expect(rangeContains(range, { row: 2, col: 4 })).toBe(false);
  });
});

describe('rangeArea', () => {
  it('counts cells', () => {
    expect(rangeArea(r(0, 0, 1, 2))).toBe(6);
  });
});

describe('rangesIntersect', () => {
  it('detects overlap and separation', () => {
    expect(rangesIntersect(r(0, 0, 2, 2), r(1, 1, 3, 3))).toBe(true);
    expect(rangesIntersect(r(0, 0, 1, 1), r(2, 2, 3, 3))).toBe(false);
    expect(rangesIntersect(r(0, 0, 1, 1), r(0, 2, 1, 3))).toBe(false); // side by side
    expect(rangesIntersect(r(0, 0, 1, 1), r(2, 0, 3, 1))).toBe(false); // stacked
  });
});

describe('rangeUnion', () => {
  it('covers both ranges', () => {
    expect(normalizeRange(rangeUnion(r(0, 0, 1, 1), r(3, 4, 5, 6)))).toEqual({
      top: 0,
      left: 0,
      bottom: 5,
      right: 6,
    });
  });
});

describe('forEachCell', () => {
  it('walks row-major', () => {
    const seen: string[] = [];
    forEachCell(r(0, 0, 1, 1), (a) => seen.push(`${a.row},${a.col}`));
    expect(seen).toEqual(['0,0', '0,1', '1,0', '1,1']);
  });
});

describe('clampRange', () => {
  it('clamps to grid bounds', () => {
    expect(normalizeRange(clampRange(r(-2, -2, 100, 100), 10, 8))).toEqual({
      top: 0,
      left: 0,
      bottom: 9,
      right: 7,
    });
  });
});
