import { describe, it, expect } from 'vitest';
import { defaultTheme, resolveTheme, buildTheme } from './theme.js';
import { darkPalette } from './palette.js';
import { compactDensity } from './density.js';

describe('resolveTheme', () => {
  it('returns the default theme when no override is given', () => {
    expect(resolveTheme()).toBe(defaultTheme);
  });
  it('merges a partial override', () => {
    const theme = resolveTheme({ textColor: '#000', fontSize: 16 });
    expect(theme.textColor).toBe('#000');
    expect(theme.fontSize).toBe(16);
    expect(theme.background).toBe(defaultTheme.background);
  });
});

describe('buildTheme', () => {
  it('defaults to the light palette at comfortable density (= default theme)', () => {
    expect(buildTheme()).toEqual(defaultTheme);
  });

  it('composes a palette name × density name', () => {
    const theme = buildTheme({ palette: 'dark', density: 'compact' });
    expect(theme.background).toBe(darkPalette.background);
    expect(theme.defaultRowHeight).toBe(compactDensity.defaultRowHeight);
    expect(theme.fontSize).toBe(compactDensity.fontSize);
  });

  it('accepts explicit palette/density objects and a font family', () => {
    const theme = buildTheme({
      palette: darkPalette,
      density: compactDensity,
      fontFamily: 'Iosevka',
    });
    expect(theme.fontFamily).toBe('Iosevka');
    expect(theme.textColor).toBe(darkPalette.textColor);
  });

  it('applies field overrides last', () => {
    const theme = buildTheme({ palette: 'dark', overrides: { activeBorder: '#ff0000', defaultColWidth: 200 } });
    expect(theme.activeBorder).toBe('#ff0000');
    expect(theme.defaultColWidth).toBe(200);
  });

  it('produces exactly the GridTheme key set', () => {
    expect(Object.keys(buildTheme({ palette: 'sepia' })).sort()).toEqual(Object.keys(defaultTheme).sort());
  });
});
