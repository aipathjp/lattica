import { describe, it, expect } from 'vitest';
import { formatNumber, parseFormat } from './number-format.js';

describe('formatNumber', () => {
  it('groups thousands with fixed decimals', () => {
    expect(formatNumber(1234.5, '#,##0.00')).toBe('1,234.50');
    expect(formatNumber(1234567, '#,##0')).toBe('1,234,567');
  });

  it('formats percent (scales by 100)', () => {
    expect(formatNumber(0.1234, '0.0%')).toBe('12.3%');
    expect(formatNumber(1, '0%')).toBe('100%');
  });

  it('applies a currency prefix and keeps the sign before it', () => {
    expect(formatNumber(5, '$#,##0')).toBe('$5');
    expect(formatNumber(-5, '$#,##0')).toBe('-$5');
    expect(formatNumber(1234.56, '$#,##0.00')).toBe('$1,234.56');
  });

  it('supports a quoted literal suffix', () => {
    expect(formatNumber(42, '0 "pcs"')).toBe('42 pcs');
  });

  it('pads to the minimum integer digits', () => {
    expect(formatNumber(7, '000')).toBe('007');
  });

  it('trims optional (#) fraction zeros down to the minimum', () => {
    expect(formatNumber(1.5, '0.0##')).toBe('1.5');
    expect(formatNumber(1.25, '0.0##')).toBe('1.25');
    expect(formatNumber(1.2349, '0.0##')).toBe('1.235');
  });

  it('handles a no-decimal pattern with rounding', () => {
    expect(formatNumber(2.7, '0')).toBe('3');
  });

  it('keeps a single leading zero for values < 1', () => {
    expect(formatNumber(0.5, '0.00')).toBe('0.50');
  });

  it('returns non-finite values via String()', () => {
    expect(formatNumber(Infinity, '0.00')).toBe('Infinity');
    expect(formatNumber(NaN, '0.00')).toBe('NaN');
  });

  it('treats a pattern with no digit tokens as a literal suffix', () => {
    expect(formatNumber(5, '"units"')).toBe('5units');
  });

  it('handles patterns with only optional (#) placeholders', () => {
    // No required digits in the integer or fraction parts.
    expect(formatNumber(1234.5, '#,###.##')).toBe('1,234.5');
    expect(formatNumber(0, '#,###.##')).toBe('0');
  });
});

describe('parseFormat', () => {
  it('extracts components from a rich pattern', () => {
    expect(parseFormat('$#,##0.00')).toEqual({
      prefix: '$',
      suffix: '',
      useGrouping: true,
      intMin: 1,
      fracMin: 2,
      fracMax: 2,
      percent: false,
    });
  });

  it('flags percent and parses optional fraction digits', () => {
    const p = parseFormat('0.0#%');
    expect(p.percent).toBe(true);
    expect(p.fracMin).toBe(1);
    expect(p.fracMax).toBe(2);
  });
});
