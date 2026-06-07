/**
 * In-cell sparklines — pure geometry for line / bar / win-loss mini charts.
 * Given a numeric series and a target rectangle size, produce drawable shapes
 * (line points or bar rects) in cell-local coordinates. The renderer translates
 * these by the cell's origin and strokes/fills them; this module has no canvas.
 */

export type SparklineKind = 'line' | 'bar' | 'winloss';

export interface SparklinePoint {
  x: number;
  y: number;
}

export interface SparklineBar {
  x: number;
  y: number;
  width: number;
  height: number;
  positive: boolean;
}

export interface SparklineShape {
  kind: SparklineKind;
  points?: SparklinePoint[];
  bars?: SparklineBar[];
}

/**
 * Compute the drawable shape for `values` within a `width × height` box (with
 * `pad` inset). Returns null when there are no finite values.
 */
export function computeSparkline(
  values: readonly number[],
  width: number,
  height: number,
  kind: SparklineKind = 'line',
  pad = 2,
): SparklineShape | null {
  const nums = values.filter((v) => Number.isFinite(v));
  if (nums.length === 0) {
    return null;
  }
  const innerW = Math.max(1, width - pad * 2);
  const innerH = Math.max(1, height - pad * 2);

  if (kind === 'line') {
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const span = max - min || 1;
    const points = nums.map((v, i) => ({
      x: nums.length === 1 ? pad + innerW / 2 : pad + (i * innerW) / (nums.length - 1),
      y: pad + (1 - (v - min) / span) * innerH,
    }));
    return { kind, points };
  }

  const bw = innerW / nums.length;
  if (kind === 'bar') {
    const maxAbs = Math.max(...nums.map((v) => Math.abs(v))) || 1;
    const bars = nums.map((v, i) => {
      const h = (Math.abs(v) / maxAbs) * innerH;
      return {
        x: pad + i * bw,
        y: pad + (innerH - h),
        width: Math.max(1, bw * 0.8),
        height: h,
        positive: v >= 0,
      };
    });
    return { kind, bars };
  }

  // win-loss: equal-height marks above/below the midline.
  const mid = pad + innerH / 2;
  const half = innerH / 2;
  const bars = nums.map((v, i) => {
    const positive = v >= 0;
    return {
      x: pad + i * bw,
      y: positive ? mid - half : mid,
      width: Math.max(1, bw * 0.8),
      height: half,
      positive,
    };
  });
  return { kind, bars };
}
