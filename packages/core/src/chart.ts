/**
 * Chart layout — pure geometry for line / bar / pie charts. Given a
 * {@link ChartSpec} (series, categories, size), produce a {@link ChartLayout}
 * with the plot rectangle, axis ticks, and per-series drawable primitives
 * (points / bars / pie slices) plus a legend. No canvas: the renderer consumes
 * the layout and strokes/fills it; tests assert on the layout directly.
 */

export type ChartKind = 'line' | 'bar' | 'pie';

export interface ChartSeries {
  name: string;
  values: number[];
  color?: string;
}

export interface ChartSpec {
  kind: ChartKind;
  series: ChartSeries[];
  categories?: string[];
  width: number;
  height: number;
  /** Inset around the plot area (defaults: left 44, bottom 24, top 12, right 12). */
  padding?: { left?: number; right?: number; top?: number; bottom?: number };
}

export interface ChartRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AxisTick {
  /** Pixel position along the axis. */
  pos: number;
  /** Numeric value (y-axis) or undefined (category x-axis). */
  value?: number;
  label: string;
}

export interface LinePoint {
  x: number;
  y: number;
}

export interface ChartBar {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export interface PieSlice {
  startAngle: number;
  endAngle: number;
  color: string;
  label: string;
  value: number;
}

export interface ChartLayout {
  kind: ChartKind;
  plot: ChartRect;
  xTicks: AxisTick[];
  yTicks: AxisTick[];
  lines: { name: string; color: string; points: LinePoint[] }[];
  bars: ChartBar[];
  pie: { cx: number; cy: number; r: number; slices: PieSlice[] };
  legend: { label: string; color: string }[];
}

/** Default qualitative color palette. */
export const CHART_PALETTE = [
  '#2563eb',
  '#dc2626',
  '#16a34a',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#65a30d',
] as const;

function colorAt(series: ChartSeries, i: number): string {
  return series.color ?? CHART_PALETTE[i % CHART_PALETTE.length]!;
}

/** Round a range/step to a "nice" value (1/2/5 × 10ⁿ). Exported for testing. */
export function niceNum(range: number, round: boolean): number {
  const exp = Math.floor(Math.log10(range));
  const f = range / 10 ** exp;
  let nf: number;
  if (round) {
    nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  } else {
    nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  }
  return nf * 10 ** exp;
}

export interface NiceScale {
  min: number;
  max: number;
  step: number;
  ticks: number[];
}

/** A "nice" axis scale covering `[min, max]` with about `maxTicks` ticks. */
export function niceScale(min: number, max: number, maxTicks = 5): NiceScale {
  const range = niceNum(max - min || 1, false);
  const step = niceNum(range / Math.max(1, maxTicks - 1), true);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  // Decimal places implied by the step, to avoid float noise in labels.
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  for (let v = niceMin; v <= niceMax + step / 2; v += step) {
    ticks.push(Number(v.toFixed(decimals)));
  }
  return { min: niceMin, max: niceMax, step, ticks };
}

function emptyLayout(kind: ChartKind, plot: ChartRect): ChartLayout {
  return { kind, plot, xTicks: [], yTicks: [], lines: [], bars: [], pie: { cx: 0, cy: 0, r: 0, slices: [] }, legend: [] };
}

/** Compute the full drawable layout for a chart spec. */
export function layoutChart(spec: ChartSpec): ChartLayout {
  const padLeft = spec.padding?.left ?? 44;
  const padRight = spec.padding?.right ?? 12;
  const padTop = spec.padding?.top ?? 12;
  const padBottom = spec.padding?.bottom ?? 24;
  const plot: ChartRect = {
    x: padLeft,
    y: padTop,
    width: Math.max(1, spec.width - padLeft - padRight),
    height: Math.max(1, spec.height - padTop - padBottom),
  };

  const legend = spec.series.map((s, i) => ({ label: s.name, color: colorAt(s, i) }));

  if (spec.kind === 'pie') {
    return layoutPie(spec, plot, legend);
  }
  return layoutCartesian(spec, plot, legend);
}

function layoutPie(
  spec: ChartSpec,
  plot: ChartRect,
  legend: { label: string; color: string }[],
): ChartLayout {
  const layout = emptyLayout('pie', plot);
  layout.legend = legend;
  const series = spec.series[0];
  if (series === undefined) {
    return layout;
  }
  const values = series.values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = values.reduce((a, b) => a + b, 0);
  const cx = plot.x + plot.width / 2;
  const cy = plot.y + plot.height / 2;
  const r = Math.min(plot.width, plot.height) / 2;
  layout.pie = { cx, cy, r, slices: [] };
  if (total === 0) {
    return layout;
  }
  let angle = -Math.PI / 2; // start at 12 o'clock
  values.forEach((v, i) => {
    const sweep = (v / total) * Math.PI * 2;
    layout.pie.slices.push({
      startAngle: angle,
      endAngle: angle + sweep,
      color: CHART_PALETTE[i % CHART_PALETTE.length]!,
      label: spec.categories?.[i] ?? String(i + 1),
      value: v,
    });
    angle += sweep;
  });
  return layout;
}

function layoutCartesian(
  spec: ChartSpec,
  plot: ChartRect,
  legend: { label: string; color: string }[],
): ChartLayout {
  const layout = emptyLayout(spec.kind, plot);
  layout.legend = legend;

  const allValues = spec.series.flatMap((s) => s.values.filter((v) => Number.isFinite(v)));
  if (allValues.length === 0) {
    return layout;
  }
  let dataMin = Math.min(...allValues);
  let dataMax = Math.max(...allValues);
  // Bars are measured from a zero baseline; include 0 in the domain.
  if (spec.kind === 'bar') {
    dataMin = Math.min(dataMin, 0);
    dataMax = Math.max(dataMax, 0);
  }
  const scale = niceScale(dataMin, dataMax);
  const span = scale.max - scale.min || 1;
  const toY = (v: number): number => plot.y + plot.height * (1 - (v - scale.min) / span);

  layout.yTicks = scale.ticks.map((v) => ({ pos: toY(v), value: v, label: String(v) }));

  const categoryCount = Math.max(...spec.series.map((s) => s.values.length), 0);
  const categories = spec.categories ?? [];
  layout.xTicks = Array.from({ length: categoryCount }, (_, i) => ({
    pos:
      categoryCount === 1
        ? plot.x + plot.width / 2
        : plot.x + (i * plot.width) / (categoryCount - 1),
    label: categories[i] ?? String(i + 1),
  }));

  if (spec.kind === 'line') {
    layout.lines = spec.series.map((s, si) => ({
      name: s.name,
      color: colorAt(s, si),
      points: s.values
        .map((v, i) =>
          Number.isFinite(v)
            ? {
                x:
                  categoryCount === 1
                    ? plot.x + plot.width / 2
                    : plot.x + (i * plot.width) / (categoryCount - 1),
                y: toY(v),
              }
            : null,
        )
        .filter((p): p is LinePoint => p !== null),
    }));
    return layout;
  }

  // Grouped bars: each category band split across the series.
  const bandWidth = plot.width / Math.max(1, categoryCount);
  const groupWidth = bandWidth * 0.8;
  const barWidth = groupWidth / Math.max(1, spec.series.length);
  const baselineY = toY(0);
  spec.series.forEach((s, si) => {
    s.values.forEach((v, i) => {
      if (!Number.isFinite(v)) {
        return;
      }
      const bandX = plot.x + i * bandWidth + (bandWidth - groupWidth) / 2;
      const x = bandX + si * barWidth;
      const y = toY(v);
      layout.bars.push({
        x,
        y: Math.min(y, baselineY),
        width: Math.max(1, barWidth * 0.9),
        height: Math.abs(y - baselineY),
        color: colorAt(s, si),
      });
    });
  });
  return layout;
}
