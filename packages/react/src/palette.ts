/**
 * Color palettes — the color-only half of a {@link GridTheme}. A palette is the
 * set of nine semantic colors (text, surfaces, grid lines, selection). Keeping
 * color separate from spacing ({@link ./density}) lets a theme be composed as
 * "palette × density" via `buildTheme`, so every palette is available at every
 * density without duplication.
 *
 * Ships light and dark families plus a few popular alternatives (midnight,
 * sepia, Solarized light/dark) and an accessibility high-contrast palette.
 */

export interface ColorPalette {
  textColor: string;
  background: string;
  gridLineColor: string;
  headerBackground: string;
  headerTextColor: string;
  headerGridLineColor: string;
  selectionFill: string;
  selectionBorder: string;
  activeBorder: string;
}

/** Default light palette (matches the historical default theme colors). */
export const lightPalette: ColorPalette = {
  textColor: '#1f2933',
  background: '#ffffff',
  gridLineColor: '#e4e7eb',
  headerBackground: '#f5f7fa',
  headerTextColor: '#52606d',
  headerGridLineColor: '#cbd2d9',
  selectionFill: 'rgba(37, 99, 235, 0.12)',
  selectionBorder: '#2563eb',
  activeBorder: '#2563eb',
};

/** Neutral slate dark palette. */
export const darkPalette: ColorPalette = {
  textColor: '#e4e7eb',
  background: '#1f2933',
  gridLineColor: '#3e4c59',
  headerBackground: '#323f4b',
  headerTextColor: '#9aa5b1',
  headerGridLineColor: '#52606d',
  selectionFill: 'rgba(96, 165, 250, 0.20)',
  selectionBorder: '#60a5fa',
  activeBorder: '#60a5fa',
};

/** Maximum-contrast palette for accessibility. */
export const highContrastPalette: ColorPalette = {
  textColor: '#000000',
  background: '#ffffff',
  gridLineColor: '#000000',
  headerBackground: '#000000',
  headerTextColor: '#ffffff',
  headerGridLineColor: '#000000',
  selectionFill: 'rgba(0, 0, 0, 0.25)',
  selectionBorder: '#000000',
  activeBorder: '#0000ff',
};

/** Deep indigo/navy dark palette. */
export const midnightPalette: ColorPalette = {
  textColor: '#e0e7ff',
  background: '#0f172a',
  gridLineColor: '#1e293b',
  headerBackground: '#1e293b',
  headerTextColor: '#94a3b8',
  headerGridLineColor: '#334155',
  selectionFill: 'rgba(129, 140, 248, 0.22)',
  selectionBorder: '#818cf8',
  activeBorder: '#818cf8',
};

/** Warm, paper-like light palette. */
export const sepiaPalette: ColorPalette = {
  textColor: '#433422',
  background: '#f8f3e8',
  gridLineColor: '#e4d8bf',
  headerBackground: '#efe6d3',
  headerTextColor: '#7a6a52',
  headerGridLineColor: '#d9caa8',
  selectionFill: 'rgba(161, 98, 7, 0.14)',
  selectionBorder: '#a16207',
  activeBorder: '#a16207',
};

/** Solarized light palette. */
export const solarizedLightPalette: ColorPalette = {
  textColor: '#586e75',
  background: '#fdf6e3',
  gridLineColor: '#eee8d5',
  headerBackground: '#eee8d5',
  headerTextColor: '#657b83',
  headerGridLineColor: '#93a1a1',
  selectionFill: 'rgba(38, 139, 210, 0.15)',
  selectionBorder: '#268bd2',
  activeBorder: '#268bd2',
};

/** Solarized dark palette. */
export const solarizedDarkPalette: ColorPalette = {
  textColor: '#93a1a1',
  background: '#002b36',
  gridLineColor: '#073642',
  headerBackground: '#073642',
  headerTextColor: '#839496',
  headerGridLineColor: '#586e75',
  selectionFill: 'rgba(38, 139, 210, 0.22)',
  selectionBorder: '#268bd2',
  activeBorder: '#268bd2',
};

/** All named palettes. */
export const palettes = {
  light: lightPalette,
  dark: darkPalette,
  highContrast: highContrastPalette,
  midnight: midnightPalette,
  sepia: sepiaPalette,
  solarizedLight: solarizedLightPalette,
  solarizedDark: solarizedDarkPalette,
} as const;

export type PaletteName = keyof typeof palettes;

/** Look up a palette by name. */
export function getPalette(name: PaletteName): ColorPalette {
  return palettes[name];
}

/** Names of dark-family palettes (useful for an auto light/dark switch). */
export const darkPaletteNames: readonly PaletteName[] = ['dark', 'midnight', 'solarizedDark'];

/** Is the named palette part of the dark family? */
export function isDarkPalette(name: PaletteName): boolean {
  return darkPaletteNames.includes(name);
}
