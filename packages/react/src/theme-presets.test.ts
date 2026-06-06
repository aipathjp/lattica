import { describe, it, expect } from 'vitest';
import { defaultTheme } from './theme.js';
import {
  lightTheme,
  darkTheme,
  highContrastTheme,
  themePresets,
  getPreset,
} from './theme-presets.js';

const presetEntries = [
  ['light', lightTheme],
  ['dark', darkTheme],
  ['highContrast', highContrastTheme],
] as const;

const defaultKeys = Object.keys(defaultTheme).sort();

const colorKeys = [
  'textColor',
  'background',
  'gridLineColor',
  'headerBackground',
  'headerTextColor',
  'headerGridLineColor',
  'selectionFill',
  'selectionBorder',
  'activeBorder',
] as const;

const numericKeys = [
  'fontFamily',
  'fontSize',
  'cellPaddingX',
  'rowHeaderWidth',
  'colHeaderHeight',
  'defaultRowHeight',
  'defaultColWidth',
] as const;

describe('theme presets', () => {
  it('each preset has exactly the GridTheme key set', () => {
    for (const [, theme] of presetEntries) {
      expect(Object.keys(theme).sort()).toEqual(defaultKeys);
    }
  });

  it('light preset equals the default theme', () => {
    expect(lightTheme).toEqual(defaultTheme);
  });

  it('all presets keep numeric/layout fields consistent with the default', () => {
    for (const [, theme] of presetEntries) {
      for (const key of numericKeys) {
        expect(theme[key]).toEqual(defaultTheme[key]);
      }
    }
  });

  it('dark and highContrast differ from light in at least one color', () => {
    const differs = (theme: GridThemeLike): boolean =>
      colorKeys.some((key) => theme[key] !== lightTheme[key]);
    expect(differs(darkTheme)).toBe(true);
    expect(differs(highContrastTheme)).toBe(true);
  });

  it('themePresets maps names to the matching theme objects', () => {
    expect(themePresets.light).toBe(lightTheme);
    expect(themePresets.dark).toBe(darkTheme);
    expect(themePresets.highContrast).toBe(highContrastTheme);
  });

  it('getPreset returns each preset by name', () => {
    expect(getPreset('light')).toBe(lightTheme);
    expect(getPreset('dark')).toBe(darkTheme);
    expect(getPreset('highContrast')).toBe(highContrastTheme);
  });
});

type GridThemeLike = typeof lightTheme;
