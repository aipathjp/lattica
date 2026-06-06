import { describe, it, expect } from 'vitest';
import { a1ToR1C1, r1c1ToA1, isR1C1 } from './r1c1.js';

describe('a1ToR1C1', () => {
  // Base cell C3 (zero-based row 2, col 2).
  const baseRow = 2;
  const baseCol = 2;

  it('converts a fully relative reference to relative R1C1', () => {
    // A1 = row 0, col 0 -> delta (-2, -2) from C3.
    expect(a1ToR1C1('A1', baseRow, baseCol)).toBe('R[-2]C[-2]');
  });

  it('emits bare markers for zero deltas (same cell)', () => {
    // C3 relative to C3 -> no offsets.
    expect(a1ToR1C1('C3', baseRow, baseCol)).toBe('RC');
  });

  it('emits a positive delta with sign-free bracket value', () => {
    // E5 = row 4, col 4 -> delta (+2, +2).
    expect(a1ToR1C1('E5', baseRow, baseCol)).toBe('R[2]C[2]');
  });

  it('converts a fully absolute reference to absolute R1C1', () => {
    expect(a1ToR1C1('$A$1', baseRow, baseCol)).toBe('R1C1');
  });

  it('converts mixed: absolute column, relative row', () => {
    // $A1 -> col absolute (C1), row relative (row 0 vs base 2 -> R[-2]).
    expect(a1ToR1C1('$A1', baseRow, baseCol)).toBe('R[-2]C1');
  });

  it('converts mixed: relative column, absolute row', () => {
    // A$1 -> row absolute (R1), col relative (col 0 vs base 2 -> C[-2]).
    expect(a1ToR1C1('A$1', baseRow, baseCol)).toBe('R1C[-2]');
  });

  it('handles a relative axis with zero delta combined with an absolute axis', () => {
    // C$3 with base C3: col relative delta 0 -> C, row absolute -> R3.
    expect(a1ToR1C1('C$3', baseRow, baseCol)).toBe('R3C');
  });

  it('throws SyntaxError on malformed A1', () => {
    expect(() => a1ToR1C1('not-a-ref', 0, 0)).toThrow(SyntaxError);
  });
});

describe('r1c1ToA1', () => {
  const baseRow = 2;
  const baseCol = 2;

  it('converts relative R1C1 with brackets back to relative A1', () => {
    expect(r1c1ToA1('R[-2]C[-2]', baseRow, baseCol)).toBe('A1');
  });

  it('converts bare markers (zero delta) back to the base cell', () => {
    expect(r1c1ToA1('RC', baseRow, baseCol)).toBe('C3');
  });

  it('converts positive relative offsets back to A1', () => {
    expect(r1c1ToA1('R[2]C[2]', baseRow, baseCol)).toBe('E5');
  });

  it('converts absolute R1C1 back to absolute $A$1', () => {
    expect(r1c1ToA1('R1C1', baseRow, baseCol)).toBe('$A$1');
  });

  it('converts mixed: absolute column, relative row', () => {
    expect(r1c1ToA1('R[-2]C1', baseRow, baseCol)).toBe('$A1');
  });

  it('converts mixed: relative column, absolute row', () => {
    expect(r1c1ToA1('R1C[-2]', baseRow, baseCol)).toBe('A$1');
  });

  it('handles a relative zero-delta axis combined with an absolute axis', () => {
    expect(r1c1ToA1('R3C', baseRow, baseCol)).toBe('C$3');
  });

  it('is case-insensitive on the R/C markers', () => {
    expect(r1c1ToA1('r1c1', baseRow, baseCol)).toBe('$A$1');
  });

  it('throws SyntaxError on malformed R1C1', () => {
    expect(() => r1c1ToA1('XYZ', baseRow, baseCol)).toThrow(SyntaxError);
  });

  it('throws RangeError when the resolved row is negative', () => {
    // R[-5] from base row 2 -> -3.
    expect(() => r1c1ToA1('R[-5]C1', baseRow, baseCol)).toThrow(RangeError);
  });

  it('throws RangeError when the resolved column is negative', () => {
    // C[-5] from base col 2 -> -3 (row part valid so we reach the column guard).
    expect(() => r1c1ToA1('R1C[-5]', baseRow, baseCol)).toThrow(RangeError);
  });
});

describe('isR1C1', () => {
  it('returns true for absolute, relative, mixed, and bare forms', () => {
    expect(isR1C1('R1C1')).toBe(true);
    expect(isR1C1('R[-2]C[-1]')).toBe(true);
    expect(isR1C1('RC')).toBe(true);
    expect(isR1C1('R[-2]C1')).toBe(true);
    expect(isR1C1('R1C[3]')).toBe(true);
    expect(isR1C1(' R1C1 ')).toBe(true); // trimmed
    expect(isR1C1('r1c1')).toBe(true); // case-insensitive
  });

  it('returns false for non-R1C1 strings', () => {
    expect(isR1C1('A1')).toBe(false);
    expect(isR1C1('')).toBe(false);
    expect(isR1C1('R')).toBe(false); // missing C component
    expect(isR1C1('RCC')).toBe(false);
    expect(isR1C1('R1C1X')).toBe(false);
    expect(isR1C1('R[]C1')).toBe(false); // empty bracket
  });
});

describe('round-trips', () => {
  const baseRow = 4;
  const baseCol = 7;
  const samples = ['A1', '$A$1', '$B10', 'C$3', 'AA100', 'H5', '$Z$1'];

  for (const a1 of samples) {
    it(`A1 -> R1C1 -> A1 is stable for ${a1}`, () => {
      const r1c1 = a1ToR1C1(a1, baseRow, baseCol);
      expect(isR1C1(r1c1)).toBe(true);
      expect(r1c1ToA1(r1c1, baseRow, baseCol)).toBe(a1);
    });
  }

  const r1c1Samples = ['R1C1', 'R[-2]C[-1]', 'RC', 'R[3]C5', 'R2C[4]'];
  for (const r1c1 of r1c1Samples) {
    it(`R1C1 -> A1 -> R1C1 is stable for ${r1c1}`, () => {
      const a1 = r1c1ToA1(r1c1, baseRow, baseCol);
      expect(a1ToR1C1(a1, baseRow, baseCol)).toBe(r1c1);
    });
  }
});
