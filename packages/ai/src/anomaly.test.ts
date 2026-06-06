import { describe, it, expect } from 'vitest';
import {
  mean,
  stddev,
  zScoreOutliers,
  iqrOutliers,
  detectColumnOutliers,
  type Outlier,
} from './anomaly.js';

describe('mean', () => {
  it('returns 0 for an empty series', () => {
    expect(mean([])).toBe(0);
  });

  it('averages a non-empty series', () => {
    expect(mean([2, 4, 6])).toBe(4);
    expect(mean([10])).toBe(10);
  });
});

describe('stddev', () => {
  it('returns 0 for empty and single-element series', () => {
    expect(stddev([])).toBe(0);
    expect(stddev([42])).toBe(0);
  });

  it('computes the population standard deviation', () => {
    // mean 4, deviations -2,0,2 -> variance 8/3
    expect(stddev([2, 4, 6])).toBeCloseTo(Math.sqrt(8 / 3), 12);
    // simple symmetric case: mean 5, deviations -1,1 -> variance 1
    expect(stddev([4, 6])).toBe(1);
  });
});

describe('zScoreOutliers', () => {
  it('returns [] for an empty series (no variance)', () => {
    expect(zScoreOutliers([])).toEqual([]);
  });

  it('returns [] for a constant series (no variance)', () => {
    expect(zScoreOutliers([5, 5, 5, 5])).toEqual([]);
  });

  it('flags a clear outlier at the default threshold', () => {
    const values = [10, 10, 10, 10, 10, 10, 10, 10, 10, 100];
    const out = zScoreOutliers(values);
    expect(out).toHaveLength(1);
    const first = out[0] as Outlier;
    expect(first.index).toBe(9);
    expect(first.value).toBe(100);
    expect(first.score).toBeGreaterThan(0);
  });

  it('honors a custom threshold', () => {
    const values = [1, 2, 3, 4, 100];
    // With a low threshold the spike is caught; with a high one it is not.
    expect(zScoreOutliers(values, 1.5)).toHaveLength(1);
    expect(zScoreOutliers(values, 10)).toEqual([]);
  });

  it('reports a negative z-score for a low outlier', () => {
    const values = [50, 50, 50, 50, 50, 50, 50, 50, 50, -100];
    const out = zScoreOutliers(values, 2);
    expect(out).toHaveLength(1);
    const first = out[0] as Outlier;
    expect(first.value).toBe(-100);
    expect(first.score).toBeLessThan(0);
  });
});

describe('iqrOutliers', () => {
  it('returns [] for an empty series', () => {
    expect(iqrOutliers([])).toEqual([]);
  });

  it('returns [] when the IQR is zero', () => {
    expect(iqrOutliers([7, 7, 7, 7])).toEqual([]);
  });

  it('flags values above the upper fence', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 100];
    const out = iqrOutliers(values);
    expect(out).toHaveLength(1);
    const first = out[0] as Outlier;
    expect(first.value).toBe(100);
    expect(first.score).toBeGreaterThan(0);
  });

  it('flags values below the lower fence with a negative score', () => {
    const values = [-100, 1, 2, 3, 4, 5, 6, 7, 8];
    const out = iqrOutliers(values);
    expect(out).toHaveLength(1);
    const first = out[0] as Outlier;
    expect(first.value).toBe(-100);
    expect(first.score).toBeLessThan(0);
  });

  it('returns no outliers for a tight spread', () => {
    expect(iqrOutliers([1, 2, 3, 4, 5])).toEqual([]);
  });

  it('honors a custom k', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 20];
    // A wide fence (large k) suppresses; a tight fence (small k) catches.
    expect(iqrOutliers(values, 5)).toEqual([]);
    expect(iqrOutliers(values, 0.5).length).toBeGreaterThan(0);
  });
});

describe('detectColumnOutliers', () => {
  it('skips nulls and maps results back to row indices (zscore default)', () => {
    // Rows: 0..12 ; row 2 and row 5 are null; spike sits at row 12.
    const data: (number | null)[] = [
      10, 10, null, 10, 10, null, 10, 10, 10, 10, 10, 10, 100,
    ];
    const out = detectColumnOutliers(data.length, (row) => data[row] as number | null);
    expect(out).toHaveLength(1);
    const first = out[0] as Outlier;
    expect(first.index).toBe(12);
    expect(first.value).toBe(100);
  });

  it('supports the iqr method', () => {
    const data: (number | null)[] = [1, 2, null, 3, 4, 5, 6, 7, 8, 100];
    const out = detectColumnOutliers(data.length, (row) => data[row] as number | null, 'iqr');
    expect(out).toHaveLength(1);
    const first = out[0] as Outlier;
    expect(first.index).toBe(9);
    expect(first.value).toBe(100);
  });

  it('returns [] when every row is null', () => {
    const out = detectColumnOutliers(3, () => null);
    expect(out).toEqual([]);
  });
});
