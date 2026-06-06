import { describe, it, expect } from 'vitest';
import { matchesSpec, fitRate, suggestRule, type RuleSpec } from './rule-gen.js';

describe('matchesSpec', () => {
  it('number: accepts finite numeric strings, rejects non-numeric', () => {
    expect(matchesSpec({ kind: 'number' }, '3.14')).toBe(true);
    expect(matchesSpec({ kind: 'number' }, '42')).toBe(true);
    expect(matchesSpec({ kind: 'number' }, 'abc')).toBe(false);
  });

  it('integer: accepts whole numbers, rejects fractional and non-numeric', () => {
    expect(matchesSpec({ kind: 'integer' }, '42')).toBe(true);
    expect(matchesSpec({ kind: 'integer' }, '3.14')).toBe(false);
    expect(matchesSpec({ kind: 'integer' }, 'abc')).toBe(false);
  });

  it('boolean: accepts true/false case-insensitively, rejects others', () => {
    expect(matchesSpec({ kind: 'boolean' }, 'true')).toBe(true);
    expect(matchesSpec({ kind: 'boolean' }, 'FALSE')).toBe(true);
    expect(matchesSpec({ kind: 'boolean' }, 'yes')).toBe(false);
  });

  it('email: accepts well-formed addresses, rejects malformed', () => {
    expect(matchesSpec({ kind: 'email' }, 'a@b.com')).toBe(true);
    expect(matchesSpec({ kind: 'email' }, 'nope')).toBe(false);
    expect(matchesSpec({ kind: 'email' }, 'a@b')).toBe(false);
  });

  it('enum: accepts members, rejects non-members', () => {
    const spec: RuleSpec = { kind: 'enum', values: ['red', 'green'] };
    expect(matchesSpec(spec, 'red')).toBe(true);
    expect(matchesSpec(spec, 'blue')).toBe(false);
  });

  it('regex: accepts matches, rejects non-matches', () => {
    const spec: RuleSpec = { kind: 'regex', source: '^A\\d+$' };
    expect(matchesSpec(spec, 'A123')).toBe(true);
    expect(matchesSpec(spec, 'B123')).toBe(false);
  });

  it('any: accepts everything', () => {
    expect(matchesSpec({ kind: 'any' }, 'anything')).toBe(true);
    expect(matchesSpec({ kind: 'any' }, '')).toBe(true);
  });
});

describe('fitRate', () => {
  it('returns 1 when every non-empty value satisfies the spec', () => {
    expect(fitRate({ kind: 'integer' }, ['1', '2', '3'])).toBe(1);
  });

  it('returns a partial fraction, ignoring empty/whitespace values', () => {
    // 3 non-empty: '1','2','x' -> 2 hits / 3
    expect(fitRate({ kind: 'integer' }, ['1', '', '  ', '2', 'x'])).toBeCloseTo(2 / 3);
  });

  it('returns 1 for empty input (no non-empty values)', () => {
    expect(fitRate({ kind: 'integer' }, [])).toBe(1);
    expect(fitRate({ kind: 'integer' }, ['', '   '])).toBe(1);
  });
});

describe('suggestRule', () => {
  it('proposes integer for a whole-number set', () => {
    expect(suggestRule(['1', '2', '3'])).toEqual({ kind: 'integer' });
  });

  it('proposes number for a fractional numeric set', () => {
    expect(suggestRule(['1.5', '2.0', '3.25'])).toEqual({ kind: 'number' });
  });

  it('proposes boolean for a true/false set', () => {
    expect(suggestRule(['true', 'false', 'TRUE'])).toEqual({ kind: 'boolean' });
  });

  it('proposes email for an address set', () => {
    expect(suggestRule(['a@b.com', 'c@d.org'])).toEqual({ kind: 'email' });
  });

  it('proposes enum for a small distinct categorical set', () => {
    expect(suggestRule(['red', 'green', 'red', 'green'])).toEqual({
      kind: 'enum',
      values: ['red', 'green'],
    });
  });

  it('falls back to any when the distinct set exceeds maxEnum', () => {
    const values = ['a', 'b', 'c', 'd', 'e'];
    expect(suggestRule(values, { maxEnum: 3 })).toEqual({ kind: 'any' });
  });

  it('proposes the most specific candidate for all-empty input (fit is vacuous)', () => {
    // No non-empty values -> every candidate has fitRate 1; integer wins first.
    expect(suggestRule(['', '   '])).toEqual({ kind: 'integer' });
  });

  it('honours a lower minFit, accepting a mostly-integer set', () => {
    // 4 ints + 1 non-int -> integer fit 0.8; default 0.95 would reject.
    const values = ['1', '2', '3', '4', 'x'];
    expect(suggestRule(values)).toEqual({ kind: 'enum', values });
    expect(suggestRule(values, { minFit: 0.8 })).toEqual({ kind: 'integer' });
  });

  it('rejects enum when even the enum fit is below minFit', () => {
    // Distinct set is within maxEnum, but minFit=2 is unreachable -> any.
    expect(suggestRule(['a', 'b'], { minFit: 2 })).toEqual({ kind: 'any' });
  });

  it('honours a larger maxEnum, accepting a wider categorical set', () => {
    const values = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    expect(suggestRule(values, { maxEnum: 10 })).toEqual({ kind: 'enum', values });
  });
});
