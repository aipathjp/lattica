/**
 * Chart painter — draws a {@link ChartLayout} (computed by `@lattica/core`'s
 * `layoutChart`) onto a {@link Canvas2D}. Pure drawing: all geometry/scale work
 * lives in core, so this module just issues stroke/fill calls and is testable
 * with the recording mock context.
 */

import type { ChartLayout } from '@lattica/core';
import type { GridTheme } from './theme.js';
import type { Canvas2D } from './painter.js';

export interface ChartPaintOptions {
  width: number;
  height: number;
  dpr?: number;
}

/** Paint a chart layout onto the context. */
export function paintChart(
  ctx: Canvas2D,
  layout: ChartLayout,
  theme: GridTheme,
  options: ChartPaintOptions,
): void {
  const dpr = options.dpr ?? 1;
  ctx.save();
  /* v8 ignore next 4 -- DPR scaling is environment glue, exercised via paintScene */
  const scalable = ctx as Canvas2D & { scale?: (x: number, y: number) => void };
  if (dpr !== 1 && typeof scalable.scale === 'function') {
    scalable.scale(dpr, dpr);
  }

  ctx.fillStyle = theme.background;
  ctx.clearRect(0, 0, options.width, options.height);
  ctx.fillRect(0, 0, options.width, options.height);
  ctx.font = `${theme.fontSize}px ${theme.fontFamily}`;
  ctx.textBaseline = 'middle';

  const { plot } = layout;

  if (layout.kind === 'pie') {
    paintPie(ctx, layout, theme);
  } else {
    paintAxes(ctx, layout, theme);
    for (const bar of layout.bars) {
      ctx.fillStyle = bar.color;
      ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
    }
    for (const series of layout.lines) {
      if (series.points.length === 0) {
        continue;
      }
      ctx.strokeStyle = series.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      series.points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    }
  }

  paintLegend(ctx, layout, theme, options.width);
  // Plot border (skipped for pie, which has no rectangular plot).
  if (layout.kind !== 'pie') {
    ctx.strokeStyle = theme.gridLineColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(plot.x, plot.y, plot.width, plot.height);
  }
  ctx.restore();
}

function paintAxes(ctx: Canvas2D, layout: ChartLayout, theme: GridTheme): void {
  const { plot } = layout;
  ctx.lineWidth = 1;
  for (const tick of layout.yTicks) {
    ctx.strokeStyle = theme.gridLineColor;
    ctx.beginPath();
    ctx.moveTo(plot.x, tick.pos);
    ctx.lineTo(plot.x + plot.width, tick.pos);
    ctx.stroke();
    ctx.fillStyle = theme.headerTextColor;
    ctx.textAlign = 'right';
    ctx.fillText(tick.label, plot.x - 6, tick.pos);
  }
  ctx.fillStyle = theme.headerTextColor;
  ctx.textAlign = 'center';
  for (const tick of layout.xTicks) {
    ctx.fillText(tick.label, tick.pos, plot.y + plot.height + 12);
  }
}

function paintPie(ctx: Canvas2D, layout: ChartLayout, theme: GridTheme): void {
  const { cx, cy, r, slices } = layout.pie;
  for (const slice of slices) {
    ctx.fillStyle = slice.color;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, slice.startAngle, slice.endAngle);
    ctx.closePath();
    ctx.fill();
  }
  // Thin separators between slices for legibility.
  ctx.strokeStyle = theme.background;
  ctx.lineWidth = 1;
  for (const slice of slices) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + r * Math.cos(slice.startAngle), cy + r * Math.sin(slice.startAngle));
    ctx.stroke();
  }
}

function paintLegend(ctx: Canvas2D, layout: ChartLayout, theme: GridTheme, width: number): void {
  ctx.textAlign = 'left';
  let x = layout.plot.x;
  const y = 6;
  const swatch = 8;
  for (const item of layout.legend) {
    ctx.fillStyle = item.color;
    ctx.fillRect(x, y - swatch / 2, swatch, swatch);
    ctx.fillStyle = theme.headerTextColor;
    ctx.fillText(item.label, x + swatch + 3, y);
    x += swatch + 3 + item.label.length * 7 + 10;
    /* v8 ignore next 3 -- defensive wrap guard for very wide legends */
    if (x > width) {
      x = layout.plot.x;
    }
  }
}
