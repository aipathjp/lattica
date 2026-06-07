import { describe, it, expect } from 'vitest';
import { computeSparkline } from './sparkline.js';

describe('computeSparkline', () => {
  it('returns null when there are no finite values', () => {
    expect(computeSparkline([], 50, 20)).toBeNull();
    expect(computeSparkline([NaN, Infinity], 50, 20)).toBeNull();
  });

  it('line: maps values across the width and inverts y', () => {
    const s = computeSparkline([0, 10], 22, 22, 'line', 2);
    expect(s?.kind).toBe('line');
    const pts = s!.points!;
    expect(pts).toHaveLength(2);
    // x spans inner width [2 .. 20]; first/last at the edges.
    expect(pts[0]!.x).toBeCloseTo(2);
    expect(pts[1]!.x).toBeCloseTo(20);
    // value 0 (min) -> bottom (y=20); value 10 (max) -> top (y=2).
    expect(pts[0]!.y).toBeCloseTo(20);
    expect(pts[1]!.y).toBeCloseTo(2);
  });

  it('line: centers a single point and handles a flat series', () => {
    const single = computeSparkline([5], 22, 22, 'line', 2);
    expect(single!.points![0]!.x).toBeCloseTo(11); // pad + innerW/2
    const flat = computeSparkline([5, 5, 5], 22, 22, 'line', 2);
    // span 0 -> guarded to 1; (v-min)=0 maps every point to the bottom (y=20).
    expect(flat!.points!.every((p) => p.y === 20)).toBe(true);
  });

  it('bar: heights are proportional to |value| / maxAbs', () => {
    const s = computeSparkline([5, 10], 22, 22, 'bar', 2);
    expect(s?.kind).toBe('bar');
    const bars = s!.bars!;
    expect(bars).toHaveLength(2);
    expect(bars[0]!.height).toBeCloseTo(9); // 5/10 * innerH(18)
    expect(bars[1]!.height).toBeCloseTo(18); // full
    expect(bars[0]!.positive).toBe(true);
  });

  it('bar: guards an all-zero series (maxAbs falls back to 1)', () => {
    const s = computeSparkline([0, 0], 22, 22, 'bar', 2);
    expect(s!.bars!.every((b) => b.height === 0)).toBe(true);
  });

  it('winloss: equal-height marks above/below the midline', () => {
    const s = computeSparkline([3, -2], 22, 22, 'winloss', 2);
    expect(s?.kind).toBe('winloss');
    const bars = s!.bars!;
    expect(bars[0]!.positive).toBe(true);
    expect(bars[1]!.positive).toBe(false);
    // both have half the inner height
    expect(bars[0]!.height).toBeCloseTo(9);
    expect(bars[1]!.height).toBeCloseTo(9);
    // positive sits above the midline (smaller y), negative starts at midline
    expect(bars[0]!.y).toBeLessThan(bars[1]!.y);
  });
});
