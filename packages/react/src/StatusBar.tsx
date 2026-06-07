/**
 * LatticaStatusBar — a small, optional footer that shows live aggregates for
 * the current selection (count / sum / average / min / max), the way Excel and
 * Google Sheets do. It subscribes to the controller and re-renders on any
 * change. Consumers place it wherever they like (typically under the grid).
 */

import { useEffect, useReducer, type CSSProperties, type ReactElement } from 'react';
import type { GridController } from './controller.js';

export interface LatticaStatusBarProps {
  controller: GridController;
  className?: string;
  style?: CSSProperties;
}

/** Format an aggregate value: integers as-is, fractions to 2 dp, null as a dash. */
function fmt(n: number | null): string {
  if (n === null) {
    return '–';
  }
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function LatticaStatusBar({ controller, className, style }: LatticaStatusBarProps): ReactElement {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => controller.on('change', () => force()), [controller]);

  const s = controller.selectionSummary();
  return (
    <div
      data-testid="lattica-statusbar"
      role="status"
      className={className}
      style={{
        display: 'flex',
        gap: 16,
        padding: '4px 10px',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
        color: '#52606d',
        ...style,
      }}
    >
      <span data-testid="status-count">Count: {s.count}</span>
      <span data-testid="status-sum">Sum: {fmt(s.sum)}</span>
      <span data-testid="status-avg">Avg: {fmt(s.avg)}</span>
      <span data-testid="status-min">Min: {fmt(s.min)}</span>
      <span data-testid="status-max">Max: {fmt(s.max)}</span>
    </div>
  );
}
