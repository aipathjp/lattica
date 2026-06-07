/**
 * Density (spacing) presets — the spacing/typography half of a {@link GridTheme}.
 * A density bundles font size and the layout metrics (paddings, header sizes,
 * default row/column sizes) so users can switch the whole grid between
 * compact / comfortable / spacious without touching colors.
 *
 * `comfortable` intentionally matches the historical default theme metrics so
 * it is the drop-in default.
 */

export type Density = 'compact' | 'comfortable' | 'spacious';

export interface DensityTokens {
  fontSize: number;
  cellPaddingX: number;
  rowHeaderWidth: number;
  colHeaderHeight: number;
  defaultRowHeight: number;
  defaultColWidth: number;
}

/** Tight spacing for dense, data-heavy grids. */
export const compactDensity: DensityTokens = {
  fontSize: 12,
  cellPaddingX: 4,
  rowHeaderWidth: 40,
  colHeaderHeight: 20,
  defaultRowHeight: 20,
  defaultColWidth: 90,
};

/** Balanced default spacing (matches the default theme metrics). */
export const comfortableDensity: DensityTokens = {
  fontSize: 13,
  cellPaddingX: 6,
  rowHeaderWidth: 48,
  colHeaderHeight: 24,
  defaultRowHeight: 24,
  defaultColWidth: 100,
};

/** Roomy spacing for touch / presentation use. */
export const spaciousDensity: DensityTokens = {
  fontSize: 14,
  cellPaddingX: 10,
  rowHeaderWidth: 56,
  colHeaderHeight: 32,
  defaultRowHeight: 34,
  defaultColWidth: 120,
};

export const densityPresets: Record<Density, DensityTokens> = {
  compact: compactDensity,
  comfortable: comfortableDensity,
  spacious: spaciousDensity,
};

/** Look up a density preset by name. */
export function getDensity(name: Density): DensityTokens {
  return densityPresets[name];
}

/** The controller-sizing fields a density contributes. */
export interface DensitySizing {
  defaultRowHeight: number;
  defaultColWidth: number;
  rowHeaderWidth: number;
  colHeaderHeight: number;
}

/**
 * Controller sizing options derived from a density, for spreading into
 * `useGridController({ rowCount, colCount, ...densityOptions('compact') })`.
 */
export function densityOptions(density: Density | DensityTokens): DensitySizing {
  const t = typeof density === 'string' ? densityPresets[density] : density;
  return {
    defaultRowHeight: t.defaultRowHeight,
    defaultColWidth: t.defaultColWidth,
    rowHeaderWidth: t.rowHeaderWidth,
    colHeaderHeight: t.colHeaderHeight,
  };
}

/**
 * Scale a density's spacing by a factor (keeps font size, rounds metrics) —
 * a fine-grained "row spacing" knob on top of the named presets.
 */
export function scaleDensity(tokens: DensityTokens, factor: number): DensityTokens {
  const f = Math.max(0.1, factor);
  return {
    fontSize: tokens.fontSize,
    cellPaddingX: Math.round(tokens.cellPaddingX * f),
    rowHeaderWidth: Math.round(tokens.rowHeaderWidth * f),
    colHeaderHeight: Math.round(tokens.colHeaderHeight * f),
    defaultRowHeight: Math.round(tokens.defaultRowHeight * f),
    defaultColWidth: Math.round(tokens.defaultColWidth * f),
  };
}
