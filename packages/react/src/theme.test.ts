import { describe, it, expect } from 'vitest';
import {
  defaultTheme,
  resolveTheme,
  buildTheme,
  DEFAULT_HEADER_LINE_HEIGHT,
  DEFAULT_HEADER_PADDING_Y,
  DEFAULT_COMMENT_MARKER_COLOR,
} from './theme.js';
import { darkPalette } from './palette.js';
import { compactDensity } from './density.js';

describe('resolveTheme', () => {
  it('returns the default theme when no override is given', () => {
    expect(resolveTheme()).toBe(defaultTheme);
  });
  it('merges a partial override', () => {
    const theme = resolveTheme({ textColor: '#000', fontSize: 16, readOnlyCellBackground: '#eee' });
    expect(theme.textColor).toBe('#000');
    expect(theme.fontSize).toBe(16);
    expect(theme.readOnlyCellBackground).toBe('#eee');
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
    const theme = buildTheme({
      palette: 'dark',
      overrides: { activeBorder: '#ff0000', defaultColWidth: 200, editableCellBackground: '#fafafa' },
    });
    expect(theme.activeBorder).toBe('#ff0000');
    expect(theme.defaultColWidth).toBe(200);
    expect(theme.editableCellBackground).toBe('#fafafa');
  });

  it('produces exactly the GridTheme key set', () => {
    expect(Object.keys(buildTheme({ palette: 'sepia' })).sort()).toEqual(Object.keys(defaultTheme).sort());
  });
});

describe('header tokens', () => {
  it('ships header line-height and padding defaults', () => {
    expect(defaultTheme.headerLineHeight).toBe(DEFAULT_HEADER_LINE_HEIGHT);
    expect(defaultTheme.headerPaddingY).toBe(DEFAULT_HEADER_PADDING_Y);
    expect(buildTheme().headerLineHeight).toBe(DEFAULT_HEADER_LINE_HEIGHT);
    expect(buildTheme().headerPaddingY).toBe(DEFAULT_HEADER_PADDING_Y);
  });

  it('is overridable via resolveTheme and buildTheme overrides', () => {
    expect(resolveTheme({ headerLineHeight: 20 }).headerLineHeight).toBe(20);
    expect(resolveTheme({ headerPaddingY: 8 }).headerPaddingY).toBe(8);
    const built = buildTheme({ overrides: { headerLineHeight: 18, headerPaddingY: 6 } });
    expect(built.headerLineHeight).toBe(18);
    expect(built.headerPaddingY).toBe(6);
  });
});

describe('comment marker token', () => {
  it('defaults to the Excel-like red in defaultTheme and buildTheme', () => {
    expect(defaultTheme.commentMarkerColor).toBe(DEFAULT_COMMENT_MARKER_COLOR);
    expect(buildTheme().commentMarkerColor).toBe(DEFAULT_COMMENT_MARKER_COLOR);
    expect(DEFAULT_COMMENT_MARKER_COLOR).toBe('#d64545');
  });

  it('is overridable via buildTheme overrides and resolveTheme', () => {
    expect(buildTheme({ overrides: { commentMarkerColor: '#000000' } }).commentMarkerColor).toBe('#000000');
    expect(resolveTheme({ commentMarkerColor: '#0a0a0a' }).commentMarkerColor).toBe('#0a0a0a');
  });
});

describe('summary row tokens', () => {
  it('are unset by default and settable through overrides', () => {
    expect(defaultTheme.summaryRowBackground).toBeUndefined();
    expect(defaultTheme.summaryRowTextColor).toBeUndefined();
    const theme = buildTheme({ overrides: { summaryRowBackground: '#eef2ff', summaryRowTextColor: '#1e3a8a' } });
    expect(theme.summaryRowBackground).toBe('#eef2ff');
    expect(theme.summaryRowTextColor).toBe('#1e3a8a');
  });
});
