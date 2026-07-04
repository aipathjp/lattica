import { describe, it, expect } from 'vitest';
import {
  wrapText,
  autoColumnWidth,
  autoRowHeight,
  wrapLineHeight,
  canvasMeasurer,
  type MeasureText,
} from './measure.js';
import { createMockContext } from './test-utils.js';
import type { Canvas2D } from './painter.js';

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

describe('wrapLineHeight', () => {
  it('rounds 1.4x the font size', () => {
    expect(wrapLineHeight(13)).toBe(18);
    expect(wrapLineHeight(10)).toBe(14);
  });
});

describe('canvasMeasurer', () => {
  it('returns undefined when the context has no measureText', () => {
    const bare = { font: '' } as unknown as Canvas2D;
    expect(canvasMeasurer(bare)).toBeUndefined();
  });

  it('measures via the context and syncs the font lazily', () => {
    const ctx = createMockContext();
    const m = canvasMeasurer(ctx)!;
    expect(m('abc', '13px x')).toBe(21);
    expect(ctx.font).toBe('13px x');
    // Same font again: the font assignment is skipped, measurement still runs.
    expect(m('abcd', '13px x')).toBe(28);
    // A different font re-syncs.
    expect(m('a', '15px x')).toBe(7);
    expect(ctx.font).toBe('15px x');
    expect(ctx.calls.filter((c) => c.method === 'measureText')).toHaveLength(3);
  });
});
