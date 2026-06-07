import { describe, it, expect } from 'vitest';
import { layoutChart, niceScale, niceNum, type ChartSpec } from './chart.js';

describe('niceNum', () => {
  it('covers all rounding buckets in round mode', () => {
    expect(niceNum(1, true)).toBe(1); // f=1 -> 1
    expect(niceNum(2.5, true)).toBe(2); // f=2.5 -> 2
    expect(niceNum(5, true)).toBe(5); // f=5 -> 5
    expect(niceNum(80, true)).toBe(100); // f=8 -> 10
  });
  it('covers all buckets in non-round (ceil) mode', () => {
    expect(niceNum(1, false)).toBe(1);
    expect(niceNum(2, false)).toBe(2);
    expect(niceNum(5, false)).toBe(5);
    expect(niceNum(8, false)).toBe(10);
  });
});

describe('niceScale', () => {
  it('produces rounded ticks covering the range', () => {
    const s = niceScale(0, 95);
    expect(s.min).toBe(0);
    expect(s.max).toBeGreaterThanOrEqual(95);
    expect(s.ticks[0]).toBe(0);
    expect(s.ticks[s.ticks.length - 1]).toBe(s.max);
  });
  it('handles a degenerate range', () => {
    const s = niceScale(5, 5);
    expect(s.ticks.length).toBeGreaterThan(0);
  });
  it('keeps fractional steps clean', () => {
    const s = niceScale(0, 1);
    expect(s.ticks.every((t) => Number.isFinite(t))).toBe(true);
  });

  it('produces valid scales across many magnitudes (exercises rounding buckets)', () => {
    for (const max of [1, 2, 5, 8, 7, 40, 80, 300, 0.5, 0.2, 12, 17, 950, 3]) {
      const s = niceScale(0, max);
      expect(s.max).toBeGreaterThanOrEqual(max);
      expect(s.step).toBeGreaterThan(0);
      expect(s.ticks.length).toBeGreaterThan(1);
    }
  });
});

const base = { width: 200, height: 120 } as const;

describe('layoutChart — line', () => {
  it('lays out a plot, axes, and series points', () => {
    const spec: ChartSpec = {
      ...base,
      kind: 'line',
      categories: ['Q1', 'Q2', 'Q3'],
      series: [{ name: 'A', values: [10, 30, 20] }],
    };
    const l = layoutChart(spec);
    expect(l.kind).toBe('line');
    expect(l.plot.x).toBe(44);
    expect(l.plot.y).toBe(12);
    expect(l.xTicks.map((t) => t.label)).toEqual(['Q1', 'Q2', 'Q3']);
    expect(l.yTicks.length).toBeGreaterThan(1);
    expect(l.lines).toHaveLength(1);
    expect(l.lines[0]!.points).toHaveLength(3);
    // first point at plot left, last at plot right
    expect(l.lines[0]!.points[0]!.x).toBeCloseTo(44);
    expect(l.lines[0]!.points[2]!.x).toBeCloseTo(44 + l.plot.width);
    // higher value -> smaller y
    expect(l.lines[0]!.points[1]!.y).toBeLessThan(l.lines[0]!.points[0]!.y);
    expect(l.legend).toEqual([{ label: 'A', color: '#2563eb' }]);
  });

  it('centers a single category and drops non-finite points', () => {
    const l = layoutChart({ ...base, kind: 'line', series: [{ name: 'A', values: [5] }] });
    expect(l.lines[0]!.points[0]!.x).toBeCloseTo(44 + l.plot.width / 2);
    const withGap = layoutChart({
      ...base,
      kind: 'line',
      series: [{ name: 'A', values: [1, NaN, 3] }],
    });
    expect(withGap.lines[0]!.points).toHaveLength(2);
  });

  it('honours custom padding', () => {
    const l = layoutChart({
      ...base,
      kind: 'line',
      series: [{ name: 'A', values: [1, 2] }],
      padding: { left: 10, right: 10, top: 10, bottom: 10 },
    });
    expect(l.plot.x).toBe(10);
    expect(l.plot.y).toBe(10);
    expect(l.plot.width).toBe(base.width - 20);
    expect(l.plot.height).toBe(base.height - 20);
  });

  it('returns an empty cartesian layout when there is no finite data', () => {
    const l = layoutChart({ ...base, kind: 'line', series: [{ name: 'A', values: [NaN] }] });
    expect(l.lines).toEqual([]);
    expect(l.yTicks).toEqual([]);
    // legend is still derived from the series.
    expect(l.legend).toHaveLength(1);
  });
});

describe('layoutChart — bar', () => {
  it('lays out grouped bars from a zero baseline', () => {
    const spec: ChartSpec = {
      ...base,
      kind: 'bar',
      categories: ['x', 'y'],
      series: [
        { name: 'A', values: [10, 20] },
        { name: 'B', values: [5, 15] },
      ],
    };
    const l = layoutChart(spec);
    expect(l.bars).toHaveLength(4); // 2 categories × 2 series
    expect(l.bars.every((b) => b.height > 0)).toBe(true);
    expect(new Set(l.bars.map((b) => b.color)).size).toBe(2);
  });

  it('handles negative values around the zero baseline', () => {
    const l = layoutChart({
      ...base,
      kind: 'bar',
      categories: ['x', 'y'],
      series: [{ name: 'A', values: [-10, 10] }],
    });
    expect(l.bars).toHaveLength(2);
    expect(l.bars.every((b) => b.height > 0)).toBe(true);
  });

  it('skips non-finite bar values', () => {
    const l = layoutChart({ ...base, kind: 'bar', series: [{ name: 'A', values: [10, NaN] }] });
    expect(l.bars).toHaveLength(1);
  });
});

describe('layoutChart — pie', () => {
  it('produces slices summing to a full circle', () => {
    const l = layoutChart({
      ...base,
      kind: 'pie',
      categories: ['a', 'b', 'c'],
      series: [{ name: 'S', values: [1, 2, 1] }],
    });
    expect(l.pie.slices).toHaveLength(3);
    const sweep = l.pie.slices.reduce((s, sl) => s + (sl.endAngle - sl.startAngle), 0);
    expect(sweep).toBeCloseTo(Math.PI * 2);
    expect(l.pie.slices[1]!.label).toBe('b');
    expect(l.pie.r).toBeGreaterThan(0);
  });

  it('treats negative/zero values as empty and labels by index when no categories', () => {
    const l = layoutChart({ ...base, kind: 'pie', series: [{ name: 'S', values: [2, -1] }] });
    // only the positive value contributes a full slice
    expect(l.pie.slices).toHaveLength(2);
    expect(l.pie.slices[0]!.label).toBe('1');
    expect(l.pie.slices[1]!.value).toBe(0);
  });

  it('returns no slices for an all-zero pie or a missing series', () => {
    expect(layoutChart({ ...base, kind: 'pie', series: [{ name: 'S', values: [0, 0] }] }).pie.slices).toEqual([]);
    expect(layoutChart({ ...base, kind: 'pie', series: [] }).pie.slices).toEqual([]);
  });
});
