import { describe, it, expect } from 'vitest';
import {
  headerChromeWidth,
  isCellTextClipped,
  isHeaderLabelClipped,
  paintsCellText,
} from './overflow.js';
import type { MeasureText } from './measure.js';

/** Deterministic measurer: 7px per character, font-independent. */
const measure: MeasureText = (text) => text.length * 7;
const font = '13px sans-serif';

describe('paintsCellText', () => {
  it('treats untyped and text-rendering columns as text', () => {
    expect(paintsCellText(undefined)).toBe(true);
    expect(paintsCellText('text')).toBe(true);
    expect(paintsCellText('number')).toBe(true);
    // No dedicated renderer → the registry falls back to the text renderer.
    expect(paintsCellText('dropdown')).toBe(true);
  });

  it('excludes the renderers that paint no display text', () => {
    expect(paintsCellText('checkbox')).toBe(false);
    expect(paintsCellText('boolean')).toBe(false);
    expect(paintsCellText('bar')).toBe(false);
  });
});

describe('isCellTextClipped (single line)', () => {
  const base = { width: 100, height: 24, paddingX: 6, font, measure };

  it('reports empty text as never clipped', () => {
    expect(isCellTextClipped({ ...base, text: '' })).toBe(false);
  });

  it('reports text that fits inside the padded width as not clipped', () => {
    // 13 chars * 7 = 91 <= 100 - 6
    expect(isCellTextClipped({ ...base, text: 'a'.repeat(13) })).toBe(false);
  });

  it('reports text wider than the padded width as clipped', () => {
    // 14 chars * 7 = 98 > 100 - 6
    expect(isCellTextClipped({ ...base, text: 'a'.repeat(14) })).toBe(true);
  });

  it('gives centered text the full cell width (clipped symmetrically)', () => {
    // 14 chars * 7 = 98 <= 100 when centered, > 94 when left/right aligned.
    expect(isCellTextClipped({ ...base, text: 'a'.repeat(14), align: 'center' })).toBe(false);
    expect(isCellTextClipped({ ...base, text: 'a'.repeat(14), align: 'right' })).toBe(true);
  });
});

describe('isCellTextClipped (wrapped columns)', () => {
  const base = { width: 100, height: 40, paddingX: 6, font, measure, wrap: { lineHeight: 18 } };

  it('reports wrapped lines that fit the row height as not clipped', () => {
    // wrap width = 88; "aaaa bbbb" → 2 lines * 18 = 36 <= 40
    expect(isCellTextClipped({ ...base, text: 'aaaaaaaaaaaa bbbbbbbbbbbb' })).toBe(false);
  });

  it('reports wrapped lines overflowing the row height as clipped', () => {
    // 3 lines * 18 = 54 > 40
    expect(
      isCellTextClipped({ ...base, text: 'aaaaaaaaaaaa bbbbbbbbbbbb cccccccccccc' }),
    ).toBe(true);
  });

  it('reports a single unbreakable line wider than the wrap width as clipped', () => {
    // wrapText never splits a word: one 20-char line = 140 > 88, height fits.
    expect(isCellTextClipped({ ...base, text: 'a'.repeat(20) })).toBe(true);
  });

  it('never lets the wrap width fall below 1px on a zero-width column', () => {
    expect(isCellTextClipped({ ...base, width: 0, text: 'x' })).toBe(true);
  });
});

describe('headerChromeWidth', () => {
  const off = { collapsible: false, collapsed: false, filterIcon: false, sortIcon: false };

  it('is zero for a bare header', () => {
    expect(headerChromeWidth({ ...off, font, measure })).toBe(0);
  });

  it('measures the collapse caret in both directions', () => {
    expect(headerChromeWidth({ ...off, collapsible: true, collapsed: true, font, measure })).toBe(14);
    expect(headerChromeWidth({ ...off, collapsible: true, collapsed: false, font, measure })).toBe(14);
  });

  it('adds the filter and sort buttons with their right padding', () => {
    expect(headerChromeWidth({ ...off, filterIcon: true, font, measure })).toBe(7 + 2);
    expect(headerChromeWidth({ ...off, sortIcon: true, font, measure })).toBe(7 + 4);
    expect(
      headerChromeWidth({ ...off, collapsible: true, filterIcon: true, sortIcon: true, font, measure }),
    ).toBe(14 + 9 + 11);
  });
});

describe('isHeaderLabelClipped', () => {
  const base = { width: 100, paddingX: 6, chromeWidth: 0, font, measure };

  it('reports an empty label as never clipped', () => {
    expect(isHeaderLabelClipped({ ...base, label: '' })).toBe(false);
  });

  it('compares the label against the width left by padding and chrome', () => {
    // 13 chars * 7 = 91 <= 94, but the sort/filter chrome pushes it over.
    expect(isHeaderLabelClipped({ ...base, label: 'a'.repeat(13) })).toBe(false);
    expect(isHeaderLabelClipped({ ...base, label: 'a'.repeat(13), chromeWidth: 20 })).toBe(true);
  });

  it('measures only the widest line of a multi-line label', () => {
    // "\n" is a real line break in the DOM header; the band grows vertically.
    expect(isHeaderLabelClipped({ ...base, label: 'aaaa\naaaaaaaa' })).toBe(false);
    expect(isHeaderLabelClipped({ ...base, label: 'aaaa\n' + 'a'.repeat(20) })).toBe(true);
  });
});
