/** @ai-path/tb-react — canvas-rendered, virtualized React data grid. */

export {
  LatticaGrid,
  TOOLTIP_DELAY_MS,
  type LatticaGridHandle,
  type LatticaGridProps,
  type ContextMenuPreset,
} from './LatticaGrid.js';
export { LatticaStatusBar, type LatticaStatusBarProps } from './StatusBar.js';
export { LatticaFormulaBar, type LatticaFormulaBarProps } from './FormulaBar.js';
export { LatticaColumnSettings, type LatticaColumnSettingsProps } from './ColumnSettings.js';
export { LatticaChart, type LatticaChartProps } from './LatticaChart.js';
export {
  renderStaticTable,
  staticTablePrintCss,
  type StaticTableOptions,
} from './static-table.js';
export { paintChart, type ChartPaintOptions } from './chart-painter.js';
export { useGridController } from './useGridController.js';
export {
  GridController,
  formatValue,
  type GridControllerOptions,
  type AutoSizeRowsOptions,
  type EditState,
  type CellChange,
  type CellCommitEvent,
  type ColumnInputOptions,
  type DisplayOverride,
  type ColumnTypeOptions,
  type InputRejectEvent,
} from './controller.js';
export {
  sanitizeTimeDraft,
  normalizeTimeInput,
  sanitizeFlexibleTimeDraft,
  normalizeFlexibleTimeInput,
  excelTimeSerialToHhMm,
  type TimeInputOptions,
} from './time-input.js';
export {
  sanitizeElapsedDraft,
  parseElapsedTime,
  normalizeElapsedInput,
  formatElapsedDisplay,
  type ElapsedTime,
} from './elapsed-time.js';
export { hasFullWidthNumeric, normalizeFullWidth, type FullWidthMode } from './input-normalize.js';
export {
  defaultTheme,
  resolveTheme,
  buildTheme,
  DEFAULT_FONT_FAMILY,
  DEFAULT_HEADER_LINE_HEIGHT,
  DEFAULT_HEADER_PADDING_Y,
  DEFAULT_COMMENT_MARKER_COLOR,
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
  densityMetrics,
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
  summaryBandHeight,
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
  barRenderer,
  parseBarValue,
  truncateWithEllipsis,
  builtinRenderers,
  CellTypeRegistry,
  defaultCellTypes,
  type BarCellSpec,
  type CellRenderer,
  type CellRenderContext,
  type CellAlign,
} from './cell-types.js';
export {
  interpretKey,
  type KeyInput,
  type KeyAction,
  type EnterMoves,
  type KeyBehaviorOptions,
} from './keyboard.js';
export {
  editorKindForType,
  EditorRegistry,
  type EditorKind,
  type CustomEditorRect,
  type CustomEditorContext,
  type CustomEditorInstance,
  type CustomEditorFactory,
  type RegisterEditorOptions,
  type RegisteredEditor,
} from './editors.js';
export { scrollToCell, clampScroll, type ScrollOffset } from './scroll.js';
export {
  columnHeaderCells,
  computeHeaderRowHeights,
  rowHeaderCells,
  type HeaderHeightOptions,
  type HeaderRowHeights,
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
  wrapLineHeight,
  canvasMeasurer,
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
