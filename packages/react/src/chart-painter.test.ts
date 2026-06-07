import { describe, it, expect } from 'vitest';
import { layoutChart, type ChartSpec } from '@lattica/core';
import { paintChart } from './chart-painter.js';
import { defaultTheme } from './theme.js';
import { createMockContext } from './test-utils.js';

const methods = (ctx: ReturnType<typeof createMockContext>) => ctx.calls.map((c) => c.method);
const paint = (spec: ChartSpec) => {
  const ctx = createMockContext();
  paintChart(ctx, layoutChart(spec), defaultTheme, { width: spec.width, height: spec.height });
  return ctx;
};

describe('paintChart', () => {
  it('draws a line chart with axes and a polyline', () => {
    const ctx = paint({
      kind: 'line',
      width: 200,
      height: 120,
      categories: ['a', 'b', 'c'],
      series: [{ name: 'S', values: [1, 3, 2] }],
    });
    const m = methods(ctx);
    expect(m).toContain('clearRect');
    expect(m).toContain('moveTo'); // polyline + axis ticks
    expect(m).toContain('lineTo');
    expect(m).toContain('stroke');
    expect(m).toContain('fillText'); // axis + legend labels
    expect(m).toContain('strokeRect'); // plot border
  });

  it('draws a bar chart with filled bars', () => {
    const ctx = paint({
      kind: 'bar',
      width: 200,
      height: 120,
      categories: ['a', 'b'],
      series: [{ name: 'S', values: [10, 20] }],
    });
    // 2 bars + background + legend swatch => several fillRect calls
    expect(ctx.calls.filter((c) => c.method === 'fillRect').length).toBeGreaterThanOrEqual(3);
  });

  it('draws a pie chart with arcs and fills', () => {
    const ctx = paint({
      kind: 'pie',
      width: 200,
      height: 120,
      categories: ['a', 'b'],
      series: [{ name: 'S', values: [3, 1] }],
    });
    const m = methods(ctx);
    expect(m).toContain('arc');
    expect(m).toContain('closePath');
    expect(m).toContain('fill');
    // pie has no rectangular plot border
    expect(m).not.toContain('strokeRect');
  });

  it('skips an empty line series while drawing the others', () => {
    const ctx = paint({
      kind: 'line',
      width: 200,
      height: 120,
      categories: ['a', 'b'],
      series: [
        { name: 'data', values: [1, 2] },
        { name: 'empty', values: [NaN, NaN] }, // points -> [] -> skipped
      ],
    });
    // The non-empty series still strokes a polyline.
    expect(methods(ctx)).toContain('stroke');
    expect(methods(ctx)).toContain('clearRect');
  });
});
