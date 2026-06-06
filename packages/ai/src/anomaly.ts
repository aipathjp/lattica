/**
 * Anomaly / outlier detection — pure, deterministic statistics with no model
 * in the loop.
 *
 * The helpers here flag numeric values that deviate from the rest of a series
 * using two classic, fully reproducible methods:
 *
 *   - {@link zScoreOutliers} flags values whose standardized distance from the
 *     mean (|z|) meets a threshold.
 *   - {@link iqrOutliers} flags values outside the Tukey fences derived from the
 *     interquartile range.
 *   - {@link detectColumnOutliers} adapts either method to a column accessor
 *     that may return `null`, skipping blanks and mapping results back to the
 *     original row indices.
 *
 * Everything is side-effect free and free of I/O, so it is trivially testable
 * to 100% coverage.
 */

/** A flagged value: its position, the value itself, and a method-specific score. */
export interface Outlier {
  index: number;
  value: number;
  score: number;
}

/** Arithmetic mean of `values`; `0` for an empty series. */
export function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const v of values) {
    sum += v;
  }
  return sum / values.length;
}

/**
 * Population standard deviation of `values`; `0` for an empty or single-element
 * series (no spread to measure).
 */
export function stddev(values: readonly number[]): number {
  if (values.length <= 1) {
    return 0;
  }
  const mu = mean(values);
  let acc = 0;
  for (const v of values) {
    const d = v - mu;
    acc += d * d;
  }
  return Math.sqrt(acc / values.length);
}

/**
 * Flag values whose absolute z-score is `>= threshold` (default `3`).
 *
 * The reported `score` is the signed z-score. When the series is empty or has
 * no variance (stddev `0`), there are no outliers and an empty array is
 * returned.
 */
export function zScoreOutliers(values: readonly number[], threshold = 3): Outlier[] {
  const sigma = stddev(values);
  if (sigma === 0) {
    return [];
  }
  const mu = mean(values);
  const out: Outlier[] = [];
  for (let i = 0; i < values.length; i++) {
    const value = values[i] as number;
    const z = (value - mu) / sigma;
    if (Math.abs(z) >= threshold) {
      out.push({ index: i, value, score: z });
    }
  }
  return out;
}

/**
 * Linearly-interpolated quantile of an already-ascending-sorted array. `q` is
 * in `[0, 1]`. The array is assumed non-empty (callers guard).
 */
function quantileSorted(sorted: readonly number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const loVal = sorted[lo] as number;
  const hiVal = sorted[hi] as number;
  if (lo === hi) {
    return loVal;
  }
  return loVal + (hiVal - loVal) * (pos - lo);
}

/**
 * Flag values outside the Tukey fences `[Q1 - k*IQR, Q3 + k*IQR]`
 * (default `k = 1.5`).
 *
 * The reported `score` is the distance from the nearest fence expressed in
 * IQRs (positive above the upper fence, negative below the lower fence). An
 * empty series, or one with zero IQR, yields no outliers.
 */
export function iqrOutliers(values: readonly number[], k = 1.5): Outlier[] {
  if (values.length === 0) {
    return [];
  }
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantileSorted(sorted, 0.25);
  const q3 = quantileSorted(sorted, 0.75);
  const iqr = q3 - q1;
  if (iqr === 0) {
    return [];
  }
  const lowerFence = q1 - k * iqr;
  const upperFence = q3 + k * iqr;
  const out: Outlier[] = [];
  for (let i = 0; i < values.length; i++) {
    const value = values[i] as number;
    if (value < lowerFence) {
      out.push({ index: i, value, score: (value - lowerFence) / iqr });
    } else if (value > upperFence) {
      out.push({ index: i, value, score: (value - upperFence) / iqr });
    }
  }
  return out;
}

/**
 * Detect outliers in a column read through `getNumber`, which returns the
 * numeric cell for a row or `null` for a blank/non-numeric cell.
 *
 * `null` rows are skipped; the chosen `method` (`'zscore'` default, or
 * `'iqr'`) runs over the dense numeric series, then the resulting indices are
 * mapped back to the original row indices.
 */
export function detectColumnOutliers(
  rowCount: number,
  getNumber: (row: number) => number | null,
  method: 'zscore' | 'iqr' = 'zscore',
): Outlier[] {
  const values: number[] = [];
  const rowOf: number[] = [];
  for (let row = 0; row < rowCount; row++) {
    const n = getNumber(row);
    if (n !== null) {
      values.push(n);
      rowOf.push(row);
    }
  }
  const dense = method === 'iqr' ? iqrOutliers(values) : zScoreOutliers(values);
  return dense.map((o) => ({ index: rowOf[o.index] as number, value: o.value, score: o.score }));
}
