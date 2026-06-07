/**
 * LatticaChart — a small canvas chart component (line / bar / pie). It computes
 * the layout with `@lattica/core`'s `layoutChart` and paints it via
 * {@link paintChart}. Standalone and theme-aware; consumers place it anywhere
 * (e.g. next to a grid driven by the same data).
 */

import { useEffect, useRef, type ReactElement } from 'react';
import { layoutChart, type ChartSpec } from '@lattica/core';
import { resolveTheme, type GridTheme } from './theme.js';
import { paintChart } from './chart-painter.js';
import type { Canvas2D } from './painter.js';

export interface LatticaChartProps {
  spec: Omit<ChartSpec, 'width' | 'height'>;
  width?: number;
  height?: number;
  theme?: Partial<GridTheme>;
  'data-testid'?: string;
}

export function LatticaChart(props: LatticaChartProps): ReactElement {
  const { spec, width = 360, height = 220 } = props;
  const theme = resolveTheme(props.theme);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    /* v8 ignore next 3 -- canvas ref is always attached after mount */
    if (canvas === null) {
      return;
    }
    const ctx = canvas.getContext('2d') as Canvas2D | null;
    /* v8 ignore next 3 -- a 2D context is always available in supported envs */
    if (ctx === null) {
      return;
    }
    /* v8 ignore next -- device pixel ratio is environment-dependent glue */
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const layout = layoutChart({ ...spec, width, height });
    paintChart(ctx, layout, theme, { width, height, dpr });
  });

  return (
    <canvas
      ref={canvasRef}
      role="img"
      data-testid={props['data-testid'] ?? 'lattica-chart'}
      aria-label={`${spec.kind} chart`}
    />
  );
}
