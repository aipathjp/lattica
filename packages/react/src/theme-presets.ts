/**
 * Ready-made {@link GridTheme} presets. Each preset is a complete theme: it
 * carries every field of {@link GridTheme}. Layout/numeric fields are kept
 * identical to {@link defaultTheme} so presets are visually interchangeable —
 * only the color fields differ between them. Presets are plain data and can be
 * passed straight to the grid or merged via `resolveTheme`.
 */

import type { GridTheme } from './theme.js';
import { defaultTheme } from './theme.js';

/** The light preset: the default theme, tuned for light backgrounds. */
export const lightTheme: GridTheme = { ...defaultTheme };

/** Dark palette. Numeric/layout fields match {@link defaultTheme}. */
export const darkTheme: GridTheme = {
  ...defaultTheme,
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

/** High-contrast palette. Numeric/layout fields match {@link defaultTheme}. */
export const highContrastTheme: GridTheme = {
  ...defaultTheme,
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

/** Map of preset name → theme. */
export const themePresets: Record<'light' | 'dark' | 'highContrast', GridTheme> = {
  light: lightTheme,
  dark: darkTheme,
  highContrast: highContrastTheme,
};

/** Look up a preset by name. */
export function getPreset(name: keyof typeof themePresets): GridTheme {
  return themePresets[name];
}
