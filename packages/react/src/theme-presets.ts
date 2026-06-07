/**
 * Ready-made {@link GridTheme} presets, composed from a palette ({@link ./palette})
 * at the default `comfortable` density via {@link buildTheme}. Every preset
 * carries the full GridTheme key set; presets differ only in their colors, so
 * they are visually interchangeable. Presets are plain data and can be passed
 * straight to the grid or merged via `resolveTheme`.
 */

import type { GridTheme } from './theme.js';
import { buildTheme } from './theme.js';
import type { PaletteName } from './palette.js';

/** The light preset: identical to the default theme. */
export const lightTheme: GridTheme = buildTheme({ palette: 'light' });
/** Neutral slate dark preset. */
export const darkTheme: GridTheme = buildTheme({ palette: 'dark' });
/** Maximum-contrast accessibility preset. */
export const highContrastTheme: GridTheme = buildTheme({ palette: 'highContrast' });
/** Deep indigo/navy dark preset. */
export const midnightTheme: GridTheme = buildTheme({ palette: 'midnight' });
/** Warm paper-like light preset. */
export const sepiaTheme: GridTheme = buildTheme({ palette: 'sepia' });
/** Solarized light preset. */
export const solarizedLightTheme: GridTheme = buildTheme({ palette: 'solarizedLight' });
/** Solarized dark preset. */
export const solarizedDarkTheme: GridTheme = buildTheme({ palette: 'solarizedDark' });

/** Map of preset name → theme (one per palette). */
export const themePresets: Record<PaletteName, GridTheme> = {
  light: lightTheme,
  dark: darkTheme,
  highContrast: highContrastTheme,
  midnight: midnightTheme,
  sepia: sepiaTheme,
  solarizedLight: solarizedLightTheme,
  solarizedDark: solarizedDarkTheme,
};

/** Look up a preset by name. */
export function getPreset(name: PaletteName): GridTheme {
  return themePresets[name];
}
