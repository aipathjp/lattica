/** @lattica/react — canvas-rendered, virtualized React data grid. */

export { LatticaGrid, type LatticaGridProps } from './LatticaGrid.js';
export { useGridController } from './useGridController.js';
export {
  GridController,
  formatValue,
  type GridControllerOptions,
  type EditState,
} from './controller.js';
export { defaultTheme, resolveTheme, type GridTheme } from './theme.js';
export {
  hitTest,
  cellRect,
  columnX,
  rowY,
  columnAt,
  rowAt,
  maxScroll,
  type GridGeometry,
  type HitResult,
  type Region,
  type Rect,
} from './geometry.js';
export { buildScene, visibleIndices, type Scene, type CellPaint } from './scene.js';
export { paintScene, type Canvas2D, type PaintOptions } from './painter.js';
export { interpretKey, type KeyInput, type KeyAction } from './keyboard.js';
export { scrollToCell, clampScroll, type ScrollOffset } from './scroll.js';
export {
  columnHeaderCells,
  rowHeaderCells,
  type PositionedHeader,
  type PositionedRowHeader,
} from './headers.js';
