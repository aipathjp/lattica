/** Visual theme for the canvas-rendered grid. All values are plain data so a
 * theme can be serialized, overridden, or swapped at runtime. */

import { palettes, type ColorPalette, type PaletteName } from './palette.js';
import { densityPresets, type Density, type DensityTokens } from './density.js';

export interface GridTheme {
  fontFamily: string;
  fontSize: number;
  textColor: string;
  background: string;
  gridLineColor: string;
  headerBackground: string;
  headerTextColor: string;
  headerGridLineColor: string;
  selectionFill: string;
  selectionBorder: string;
  activeBorder: string;
  cellPaddingX: number;
  rowHeaderWidth: number;
  colHeaderHeight: number;
  defaultRowHeight: number;
  defaultColWidth: number;
}

export const defaultTheme: GridTheme = {
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontSize: 13,
  textColor: '#1f2933',
  background: '#ffffff',
  gridLineColor: '#e4e7eb',
  headerBackground: '#f5f7fa',
  headerTextColor: '#52606d',
  headerGridLineColor: '#cbd2d9',
  selectionFill: 'rgba(37, 99, 235, 0.12)',
  selectionBorder: '#2563eb',
  activeBorder: '#2563eb',
  cellPaddingX: 6,
  rowHeaderWidth: 48,
  colHeaderHeight: 24,
  defaultRowHeight: 24,
  defaultColWidth: 100,
};

/** Merge a partial override onto the default theme. */
export function resolveTheme(override?: Partial<GridTheme>): GridTheme {
  return override ? { ...defaultTheme, ...override } : defaultTheme;
}

/** The default font stack, reused by `buildTheme`. */
export const DEFAULT_FONT_FAMILY = defaultTheme.fontFamily;

export interface BuildThemeOptions {
  /** A palette name or an explicit {@link ColorPalette}. Defaults to `light`. */
  palette?: PaletteName | ColorPalette;
  /** A density name or explicit {@link DensityTokens}. Defaults to `comfortable`. */
  density?: Density | DensityTokens;
  /** Font family override. */
  fontFamily?: string;
  /** Final field overrides applied last. */
  overrides?: Partial<GridTheme>;
}

/**
 * Compose a {@link GridTheme} from a palette (colors) × density (spacing) plus
 * an optional font and field overrides. This is the recommended way to build a
 * theme: `buildTheme({ palette: 'dark', density: 'compact' })`.
 */
export function buildTheme(options: BuildThemeOptions = {}): GridTheme {
  const palette: ColorPalette =
    typeof options.palette === 'string' ? palettes[options.palette] : options.palette ?? palettes.light;
  const density: DensityTokens =
    typeof options.density === 'string' ? densityPresets[options.density] : options.density ?? densityPresets.comfortable;
  return {
    fontFamily: options.fontFamily ?? DEFAULT_FONT_FAMILY,
    fontSize: density.fontSize,
    cellPaddingX: density.cellPaddingX,
    rowHeaderWidth: density.rowHeaderWidth,
    colHeaderHeight: density.colHeaderHeight,
    defaultRowHeight: density.defaultRowHeight,
    defaultColWidth: density.defaultColWidth,
    ...palette,
    ...options.overrides,
  };
}
