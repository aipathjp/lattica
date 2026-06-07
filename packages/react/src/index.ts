/** @lattica/react — canvas-rendered, virtualized React data grid. */

export { LatticaGrid, type LatticaGridProps } from './LatticaGrid.js';
export { LatticaStatusBar, type LatticaStatusBarProps } from './StatusBar.js';
export { LatticaChart, type LatticaChartProps } from './LatticaChart.js';
export { paintChart, type ChartPaintOptions } from './chart-painter.js';
export { useGridController } from './useGridController.js';
export {
  GridController,
  formatValue,
  type GridControllerOptions,
  type EditState,
} from './controller.js';
export {
  defaultTheme,
  resolveTheme,
  buildTheme,
  DEFAULT_FONT_FAMILY,
  type GridTheme,
  type BuildThemeOptions,
} from './theme.js';
export {
  palettes,
  getPalette,
  isDarkPalette,
  darkPaletteNames,
  lightPalette,
  darkPalette,
  highContrastPalette,
  midnightPalette,
  sepiaPalette,
  solarizedLightPalette,
  solarizedDarkPalette,
  type ColorPalette,
  type PaletteName,
} from './palette.js';
export {
  densityPresets,
  getDensity,
  scaleDensity,
  densityOptions,
  compactDensity,
  comfortableDensity,
  spaciousDensity,
  type Density,
  type DensityTokens,
  type DensitySizing,
} from './density.js';
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
export {
  drawCellText,
  textRenderer,
  numberRenderer,
  booleanRenderer,
  builtinRenderers,
  CellTypeRegistry,
  defaultCellTypes,
  type CellRenderer,
  type CellRenderContext,
  type CellAlign,
} from './cell-types.js';
export { interpretKey, type KeyInput, type KeyAction } from './keyboard.js';
export { editorKindForType, type EditorKind } from './editors.js';
export { scrollToCell, clampScroll, type ScrollOffset } from './scroll.js';
export {
  columnHeaderCells,
  rowHeaderCells,
  type PositionedHeader,
  type PositionedRowHeader,
} from './headers.js';
export {
  normalizeChord,
  ShortcutRegistry,
  type ShortcutEvent,
  type ShortcutAction,
} from './shortcuts.js';
export {
  buildMenu,
  findItem,
  runItem,
  type MenuItem,
  type MenuItemSpec,
} from './menu.js';
export {
  wrapText,
  autoColumnWidth,
  autoRowHeight,
  type MeasureText,
} from './measure.js';
export { I18n, enUS, jaJP, type Locale } from './i18n.js';
export {
  gridAria,
  rowAria,
  cellAria,
  columnHeaderAria,
  rowHeaderAria,
  type AriaAttrs,
} from './aria.js';
export {
  lightTheme,
  darkTheme,
  highContrastTheme,
  midnightTheme,
  sepiaTheme,
  solarizedLightTheme,
  solarizedDarkTheme,
  themePresets,
  getPreset,
} from './theme-presets.js';
export {
  hitColumnBorder,
  hitRowBorder,
  hitResizeHandle,
  type ResizeTarget,
} from './resize.js';
