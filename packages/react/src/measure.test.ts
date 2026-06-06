import { describe, it, expect } from 'vitest';
import { wrapText, autoColumnWidth, autoRowHeight, type MeasureText } from './measure.js';

/** Deterministic measurer: 7px per character, font-independent. */
const measure: MeasureText = (text) => text.length * 7;

describe('wrapText', () => {
  it('keeps text that fits on a single line', () => {
    // "ab cd" = 5 chars * 7 = 35 <= 100
    expect(wrapText('ab cd', 100, 'x', measure)).toEqual(['ab cd']);
  });

  it('wraps multiple words greedily when they exceed maxWidth', () => {
    // each word 3 chars (21px); "foo bar" = 49px, "foo bar baz" = 77px > 50
    expect(wrapText('foo bar baz', 50, 'x', measure)).toEqual(['foo bar', 'baz']);
  });

  it('preserves explicit newlines as hard breaks', () => {
    expect(wrapText('foo\nbar', 1000, 'x', measure)).toEqual(['foo', 'bar']);
  });

  it('keeps a single oversized word on its own line', () => {
    // "wide" = 28px > 10, but cannot be split
    expect(wrapText('wide', 10, 'x', measure)).toEqual(['wide']);
  });

  it('yields a single empty line for an empty string', () => {
    expect(wrapText('', 100, 'x', measure)).toEqual(['']);
  });
});

describe('autoColumnWidth', () => {
  it('returns 0 for an empty list', () => {
    expect(autoColumnWidth([], 'x', measure)).toBe(0);
  });

  it('adds padding to the widest measured width', () => {
    // widest "hello" = 35px, + padding 8 = 43
    expect(autoColumnWidth(['hi', 'hello'], 'x', measure, { padding: 8 })).toBe(43);
  });

  it('clamps up to the minimum', () => {
    // widest "a" = 7px, min 50 -> 50
    expect(autoColumnWidth(['a'], 'x', measure, { min: 50 })).toBe(50);
  });

  it('clamps down to the maximum', () => {
    // widest "abcdefghij" = 70px, max 40 -> 40
    expect(autoColumnWidth(['abcdefghij'], 'x', measure, { max: 40 })).toBe(40);
  });

  it('uses zero padding and unbounded clamp by default', () => {
    expect(autoColumnWidth(['abc'], 'x', measure)).toBe(21);
  });
});

describe('autoRowHeight', () => {
  it('measures a single line', () => {
    // "abc" fits in 1000px -> 1 line * 20 + padding 0
    expect(autoRowHeight('abc', 1000, 'x', 20, measure)).toBe(20);
  });

  it('measures multiple wrapped lines plus padding', () => {
    // "foo bar baz" wraps to 2 lines at width 50 -> 2 * 20 + 4
    expect(autoRowHeight('foo bar baz', 50, 'x', 20, measure, { padding: 4 })).toBe(44);
  });
});
