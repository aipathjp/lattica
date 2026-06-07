import { describe, it, expect } from 'vitest';
import { aggregate, distinctValues } from './aggregate.js';

describe('aggregate', () => {
  it('sums numeric values, ignoring non-numeric', () => {
    expect(aggregate([1, 2, '3', 'x', null], 'sum')).toBe(6);
  });

  it('averages numeric values', () => {
    expect(aggregate([2, 4, 6], 'avg')).toBe(4);
  });

  it('counts non-empty cells (COUNTA-style)', () => {
    expect(aggregate([1, '', 'a', null, false], 'count')).toBe(3);
  });

  it('min and max over numbers', () => {
    expect(aggregate([5, -2, 3], 'min')).toBe(-2);
    expect(aggregate([5, -2, 3], 'max')).toBe(5);
  });

  it('median for odd and even counts', () => {
    expect(aggregate([3, 1, 2], 'median')).toBe(2);
    expect(aggregate([1, 2, 3, 4], 'median')).toBe(2.5);
  });

  it('coerces booleans to 1/0 and parses numeric strings', () => {
    expect(aggregate([true, false, '2.5'], 'sum')).toBe(3.5);
  });

  it('returns null when there are no numeric values', () => {
    expect(aggregate(['a', null, ''], 'sum')).toBeNull();
    expect(aggregate([], 'avg')).toBeNull();
  });

  it('ignores non-finite numbers', () => {
    expect(aggregate([Infinity, 2], 'sum')).toBe(2);
  });
});

describe('distinctValues', () => {
  it('returns unique values with labels sorted by label', () => {
    const result = distinctValues([3, 1, 3, 2, 1], (v) => String(v));
    expect(result.map((r) => r.label)).toEqual(['1', '2', '3']);
    expect(result.map((r) => r.value)).toEqual([1, 2, 3]);
  });

  it('keeps the first value for each label', () => {
    const result = distinctValues(['a', 'A'], (v) => String(v).toLowerCase());
    expect(result).toEqual([{ value: 'a', label: 'a' }]);
  });
});
