/**
 * Scene builder — turns the current scroll position, geometry, selection, and a
 * value accessor into a flat list of cell paint instructions for the visible
 * (and frozen) region. Pure: no canvas, no DOM. The {@link paintScene} function
 * consumes a Scene; tests assert on the Scene directly.
 */

import { computeVisibleWindow, type SelectionModel } from '@lattica/core';
import { cellRect, type GridGeometry, type Rect } from './geometry.js';

export interface CellPaint {
  row: number;
  col: number;
  rect: Rect;
  text: string;
  selected: boolean;
  active: boolean;
}

export interface Scene {
  cells: CellPaint[];
  activeRect: Rect | null;
  visibleRows: number[];
  visibleCols: number[];
}

export interface BuildSceneParams {
  geom: GridGeometry;
  scrollLeft: number;
  scrollTop: number;
  clientWidth: number;
  clientHeight: number;
  selection: SelectionModel;
  getDisplay: (row: number, col: number) => string;
  overscan?: number;
}

/** The visible index list along one axis: frozen leading indices + the window. */
export function visibleIndices(
  sizes: GridGeometry['rowSizes'],
  scroll: number,
  client: number,
  frozenCount: number,
  overscan: number,
): number[] {
  const window = computeVisibleWindow(sizes, { scroll, client, frozenCount, overscan });
  const indices: number[] = [];
  for (let i = 0; i < frozenCount && i < sizes.getCount(); i++) {
    indices.push(i);
  }
  for (let i = window.scrollable.start; i < window.scrollable.end; i++) {
    indices.push(i);
  }
  return indices;
}

export function buildScene(params: BuildSceneParams): Scene {
  const { geom, scrollLeft, scrollTop, clientWidth, clientHeight, selection, getDisplay } = params;
  const overscan = params.overscan ?? 2;

  const visibleRows = visibleIndices(
    geom.rowSizes,
    scrollTop,
    Math.max(0, clientHeight - geom.colHeaderHeight),
    geom.frozenRows,
    overscan,
  );
  const visibleCols = visibleIndices(
    geom.colSizes,
    scrollLeft,
    Math.max(0, clientWidth - geom.rowHeaderWidth),
    geom.frozenCols,
    overscan,
  );

  const cells: CellPaint[] = [];
  let activeRect: Rect | null = null;
  const state = selection.getState();

  for (const row of visibleRows) {
    for (const col of visibleCols) {
      const rect = cellRect(geom, scrollLeft, scrollTop, row, col);
      const active = selection.isActive({ row, col });
      const cell: CellPaint = {
        row,
        col,
        rect,
        text: getDisplay(row, col),
        selected: selection.isSelected({ row, col }),
        active,
      };
      cells.push(cell);
      if (active && state.active.row === row && state.active.col === col) {
        activeRect = rect;
      }
    }
  }

  return { cells, activeRect, visibleRows, visibleCols };
}
