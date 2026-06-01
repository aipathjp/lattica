import { describe, it, expect } from 'vitest';
import {
  columnIndexToLabel,
  columnLabelToIndex,
  parseA1,
  toA1,
  addressEquals,
  addressKey,
  MAX_COLUMN_INDEX,
} from './coords.js';

describe('columnIndexToLabel', () => {
  it.each([
    [0, 'A'],
    [25, 'Z'],
    [26, 'AA'],
    [27, 'AB'],
    [51, 'AZ'],
    [52, 'BA'],
    [701, 'ZZ'],
    [702, 'AAA'],
    [MAX_COLUMN_INDEX, 'XFD'],
  ])('maps index %i to %s', (index, label) => {
    expect(columnIndexToLabel(index)).toBe(label);
  });

  it('throws for negative or non-integer input', () => {
    expect(() => columnIndexToLabel(-1)).toThrow(RangeError);
    expect(() => columnIndexToLabel(1.5)).toThrow(RangeError);
  });
});

describe('columnLabelToIndex', () => {
  it.each([
    ['A', 0],
    ['Z', 25],
    ['AA', 26],
    ['ZZ', 701],
    ['AAA', 702],
    ['XFD', MAX_COLUMN_INDEX],
  ])('maps label %s to index %i', (label, index) => {
    expect(columnLabelToIndex(label)).toBe(index);
  });

  it('is case-insensitive', () => {
    expect(columnLabelToIndex('aa')).toBe(26);
    expect(columnLabelToIndex('Ab')).toBe(27);
  });

  it('round-trips with columnIndexToLabel', () => {
    for (let i = 0; i < 1000; i++) {
      expect(columnLabelToIndex(columnIndexToLabel(i))).toBe(i);
    }
  });

  it('throws on empty or invalid input', () => {
    expect(() => columnLabelToIndex('')).toThrow(SyntaxError);
    expect(() => columnLabelToIndex('A1')).toThrow(SyntaxError);
    expect(() => columnLabelToIndex('@')).toThrow(SyntaxError);
  });
});

describe('parseA1', () => {
  it('parses a plain reference', () => {
    expect(parseA1('A1')).toEqual({ row: 0, col: 0, colAbsolute: false, rowAbsolute: false });
  });

  it('parses absolute references', () => {
    expect(parseA1('$B$2')).toEqual({ row: 1, col: 1, colAbsolute: true, rowAbsolute: true });
    expect(parseA1('$C4')).toEqual({ row: 3, col: 2, colAbsolute: true, rowAbsolute: false });
    expect(parseA1('D$5')).toEqual({ row: 4, col: 3, colAbsolute: false, rowAbsolute: true });
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(parseA1('  aa10 ')).toMatchObject({ row: 9, col: 26 });
  });

  it('throws on malformed references', () => {
    expect(() => parseA1('1A')).toThrow(SyntaxError);
    expect(() => parseA1('A')).toThrow(SyntaxError);
    expect(() => parseA1('A0')).toThrow(SyntaxError);
    expect(() => parseA1('')).toThrow(SyntaxError);
  });
});

describe('toA1', () => {
  it('serializes a relative reference', () => {
    expect(toA1({ row: 0, col: 0 })).toBe('A1');
    expect(toA1({ row: 9, col: 26 })).toBe('AA10');
  });

  it('serializes absolute markers', () => {
    expect(toA1({ row: 1, col: 1 }, { colAbsolute: true, rowAbsolute: true })).toBe('$B$2');
    expect(toA1({ row: 1, col: 1 }, { colAbsolute: true })).toBe('$B2');
    expect(toA1({ row: 1, col: 1 }, { rowAbsolute: true })).toBe('B$2');
  });

  it('round-trips with parseA1', () => {
    for (const ref of ['A1', '$B$2', 'C10', 'AA100', 'XFD1048576']) {
      const parsed = parseA1(ref);
      expect(toA1(parsed, { colAbsolute: parsed.colAbsolute, rowAbsolute: parsed.rowAbsolute })).toBe(
        ref,
      );
    }
  });
});

describe('addressEquals & addressKey', () => {
  it('compares addresses structurally', () => {
    expect(addressEquals({ row: 1, col: 2 }, { row: 1, col: 2 })).toBe(true);
    expect(addressEquals({ row: 1, col: 2 }, { row: 1, col: 3 })).toBe(false);
    expect(addressEquals({ row: 1, col: 2 }, { row: 2, col: 2 })).toBe(false);
  });

  it('produces stable keys', () => {
    expect(addressKey({ row: 3, col: 4 })).toBe('3,4');
    const set = new Set([addressKey({ row: 1, col: 1 }), addressKey({ row: 1, col: 1 })]);
    expect(set.size).toBe(1);
  });
});
