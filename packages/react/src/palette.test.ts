import { describe, it, expect } from 'vitest';
import { palettes, getPalette, isDarkPalette, lightPalette } from './palette.js';

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

describe('palettes', () => {
  it('every palette defines the full color key set', () => {
    for (const palette of Object.values(palettes)) {
      expect(Object.keys(palette).sort()).toEqual([...colorKeys].sort());
    }
  });

  it('exposes the expected named palettes', () => {
    expect(Object.keys(palettes)).toEqual([
      'light',
      'dark',
      'highContrast',
      'midnight',
      'sepia',
      'solarizedLight',
      'solarizedDark',
    ]);
  });

  it('getPalette returns the palette by name', () => {
    expect(getPalette('light')).toBe(lightPalette);
    expect(getPalette('midnight')).toBe(palettes.midnight);
  });

  it('classifies dark-family palettes', () => {
    expect(isDarkPalette('dark')).toBe(true);
    expect(isDarkPalette('midnight')).toBe(true);
    expect(isDarkPalette('solarizedDark')).toBe(true);
    expect(isDarkPalette('light')).toBe(false);
    expect(isDarkPalette('sepia')).toBe(false);
  });
});
