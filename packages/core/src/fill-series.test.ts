import { describe, it, expect } from 'vitest';

import { detectSeries, extendSeries } from './fill-series.js';
import type { CellValue } from './types.js';

describe('detectSeries', () => {
  it('returns copy for an empty seed', () => {
    expect(detectSeries([])).toBe('copy');
  });

  describe('numeric', () => {
    it('detects an arithmetic progression of two numbers', () => {
      expect(detectSeries([1, 2])).toBe('numeric');
    });

    it('detects a longer consistent progression', () => {
      expect(detectSeries([2, 4, 6, 8])).toBe('numeric');
    });

    it('detects a negative delta progression', () => {
      expect(detectSeries([10, 7, 4])).toBe('numeric');
    });

    it('falls back to copy when deltas are inconsistent', () => {
      expect(detectSeries([1, 2, 4])).toBe('copy');
    });

    it('falls back to copy for a single number (ambiguous)', () => {
      expect(detectSeries([5])).toBe('copy');
    });

    it('ignores non-finite numbers (NaN) and treats as non-numeric', () => {
      expect(detectSeries([Number.NaN, Number.NaN])).toBe('copy');
    });
  });

  describe('date', () => {
    it('detects an ISO date progression by one day', () => {
      expect(detectSeries(['2026-01-01', '2026-01-02'])).toBe('date');
    });

    it('detects a multi-day date progression', () => {
      expect(detectSeries(['2026-01-01', '2026-01-08', '2026-01-15'])).toBe('date');
    });

    it('falls back to copy when date deltas are inconsistent', () => {
      expect(detectSeries(['2026-01-01', '2026-01-02', '2026-01-04'])).toBe('copy');
    });

    it('falls back to copy for a single date (ambiguous)', () => {
      expect(detectSeries(['2026-01-01'])).toBe('copy');
    });

    it('rejects malformed date strings', () => {
      expect(detectSeries(['2026-1-1', '2026-1-2'])).toBe('copy');
    });

    it('rejects impossible calendar dates', () => {
      expect(detectSeries(['2026-02-30', '2026-03-01'])).toBe('copy');
    });

    it('does not treat non-string dates as a date series', () => {
      expect(detectSeries([20260101, 20260102] as CellValue[])).toBe('numeric');
    });
  });

  describe('weekday', () => {
    it('detects three-letter weekday names', () => {
      expect(detectSeries(['Mon', 'Tue'])).toBe('weekday');
    });

    it('detects full weekday names case-insensitively', () => {
      expect(detectSeries(['monday', 'TUESDAY'])).toBe('weekday');
    });

    it('detects a single weekday', () => {
      expect(detectSeries(['Fri'])).toBe('weekday');
    });

    it('detects weekdays regardless of order (no progression required)', () => {
      expect(detectSeries(['Wed', 'Mon', 'Sun'])).toBe('weekday');
    });

    it('falls back to copy for unknown names', () => {
      expect(detectSeries(['Mon', 'Funday'])).toBe('copy');
    });

    it('does not treat non-string weekdays as weekday', () => {
      expect(detectSeries([true, false] as CellValue[])).toBe('copy');
    });
  });

  describe('copy', () => {
    it('returns copy for arbitrary text', () => {
      expect(detectSeries(['apple', 'banana'])).toBe('copy');
    });

    it('returns copy for mixed non-series values', () => {
      expect(detectSeries(['x', 1, null])).toBe('copy');
    });
  });
});

describe('extendSeries', () => {
  it('returns [] for an empty seed', () => {
    expect(extendSeries([], 3)).toEqual([]);
  });

  it('returns [] when count is zero', () => {
    expect(extendSeries([1, 2], 0)).toEqual([]);
  });

  it('returns [] when count is negative', () => {
    expect(extendSeries([1, 2], -5)).toEqual([]);
  });

  describe('numeric', () => {
    it('continues a positive delta', () => {
      expect(extendSeries([1, 3, 5], 3)).toEqual([7, 9, 11]);
    });

    it('continues a negative delta', () => {
      expect(extendSeries([10, 8], 3)).toEqual([6, 4, 2]);
    });

    it('continues a zero delta', () => {
      expect(extendSeries([4, 4], 2)).toEqual([4, 4]);
    });

    it('repeats a single number with zero delta (copy path)', () => {
      // A single number is 'copy', so it repeats itself.
      expect(extendSeries([5], 3)).toEqual([5, 5, 5]);
    });
  });

  describe('date', () => {
    it('adds one day per step', () => {
      expect(extendSeries(['2026-01-01', '2026-01-02'], 2)).toEqual([
        '2026-01-03',
        '2026-01-04',
      ]);
    });

    it('handles month rollover', () => {
      expect(extendSeries(['2026-01-30', '2026-01-31'], 2)).toEqual([
        '2026-02-01',
        '2026-02-02',
      ]);
    });

    it('handles year rollover', () => {
      expect(extendSeries(['2026-12-30', '2026-12-31'], 2)).toEqual([
        '2027-01-01',
        '2027-01-02',
      ]);
    });

    it('continues a multi-day delta', () => {
      expect(extendSeries(['2026-01-01', '2026-01-08'], 2)).toEqual([
        '2026-01-15',
        '2026-01-22',
      ]);
    });
  });

  describe('weekday', () => {
    it('cycles through the week from a three-letter seed', () => {
      expect(extendSeries(['Mon', 'Tue'], 3)).toEqual([
        'Wednesday',
        'Thursday',
        'Friday',
      ]);
    });

    it('wraps from Sunday back to Monday', () => {
      expect(extendSeries(['Sat', 'Sun'], 2)).toEqual(['Monday', 'Tuesday']);
    });

    it('extends from a single weekday', () => {
      expect(extendSeries(['Fri'], 3)).toEqual(['Saturday', 'Sunday', 'Monday']);
    });
  });

  describe('copy', () => {
    it('repeats the seed cyclically', () => {
      expect(extendSeries(['a', 'b'], 5)).toEqual(['a', 'b', 'a', 'b', 'a']);
    });

    it('repeats a single non-series value', () => {
      expect(extendSeries(['x'], 3)).toEqual(['x', 'x', 'x']);
    });
  });
});
