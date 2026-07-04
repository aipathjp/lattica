import { describe, expect, it } from 'vitest';
import { hasFullWidthNumeric, normalizeFullWidth } from './input-normalize.js';

describe('hasFullWidthNumeric', () => {
  it('detects full-width digits', () => {
    expect(hasFullWidthNumeric('１２３')).toBe(true);
    expect(hasFullWidthNumeric('a１b')).toBe(true);
    expect(hasFullWidthNumeric('０')).toBe(true);
    expect(hasFullWidthNumeric('９')).toBe(true);
  });

  it('detects full-width numeric symbols', () => {
    expect(hasFullWidthNumeric('．')).toBe(true); // U+FF0E
    expect(hasFullWidthNumeric('，')).toBe(true); // U+FF0C
    expect(hasFullWidthNumeric('－')).toBe(true); // U+FF0D
    expect(hasFullWidthNumeric('−')).toBe(true); // U+2212
    expect(hasFullWidthNumeric('＋')).toBe(true); // U+FF0B
    expect(hasFullWidthNumeric('：')).toBe(true); // U+FF1A
  });

  it('is false for half-width and unrelated full-width text', () => {
    expect(hasFullWidthNumeric('')).toBe(false);
    expect(hasFullWidthNumeric('1234.5')).toBe(false);
    expect(hasFullWidthNumeric('-1,000+9:30')).toBe(false);
    expect(hasFullWidthNumeric('あいう漢字ＡＢ')).toBe(false);
  });
});

describe('normalizeFullWidth', () => {
  it('converts full-width digits to half-width', () => {
    expect(normalizeFullWidth('０１２３４５６７８９')).toBe('0123456789');
  });

  it('converts numeric symbols including both minus variants', () => {
    expect(normalizeFullWidth('－１２３．５')).toBe('-123.5');
    expect(normalizeFullWidth('−４２')).toBe('-42');
    expect(normalizeFullWidth('＋７')).toBe('+7');
    expect(normalizeFullWidth('１，２３４．５')).toBe('1,234.5');
    expect(normalizeFullWidth('９：３０')).toBe('9:30');
  });

  it('leaves non-numeric characters (including other zenkaku) untouched', () => {
    expect(normalizeFullWidth('数量１２個')).toBe('数量12個');
    expect(normalizeFullWidth('abc')).toBe('abc');
    expect(normalizeFullWidth('')).toBe('');
  });
});
