import { describe, it, expect } from 'vitest';
import {
  inferCellType,
  inferColumnType,
  normalizeValue,
  detectDuplicateRows,
  type InferredType,
} from './schema-infer.js';

describe('inferCellType', () => {
  it('returns empty for null and undefined', () => {
    expect(inferCellType(null)).toBe('empty');
    expect(inferCellType(undefined)).toBe('empty');
  });

  it('returns empty for empty / whitespace-only strings', () => {
    expect(inferCellType('')).toBe('empty');
    expect(inferCellType('   ')).toBe('empty');
  });

  it('returns boolean for real booleans and literal strings', () => {
    expect(inferCellType(true)).toBe('boolean');
    expect(inferCellType(false)).toBe('boolean');
    expect(inferCellType('true')).toBe('boolean');
    expect(inferCellType(' false ')).toBe('boolean');
  });

  it('classifies numeric numbers as integer or number', () => {
    expect(inferCellType(42)).toBe('integer');
    expect(inferCellType(3.14)).toBe('number');
  });

  it('treats non-finite numbers as string', () => {
    expect(inferCellType(Number.NaN)).toBe('string');
    expect(inferCellType(Number.POSITIVE_INFINITY)).toBe('string');
  });

  it('classifies numeric strings, including full-width digits', () => {
    expect(inferCellType('100')).toBe('integer');
    expect(inferCellType('1.5')).toBe('number');
    expect(inferCellType('１２３')).toBe('integer');
  });

  it('classifies ISO-ish dates with dash or slash separators', () => {
    expect(inferCellType('2026-06-06')).toBe('date');
    expect(inferCellType('2026/6/6')).toBe('date');
  });

  it('rejects out-of-range date-shaped strings as string', () => {
    expect(inferCellType('2026-13-01')).toBe('string');
    expect(inferCellType('2026-00-10')).toBe('string');
    expect(inferCellType('2026-06-32')).toBe('string');
    expect(inferCellType('2026-06-00')).toBe('string');
  });

  it('returns string for ordinary text', () => {
    expect(inferCellType('hello')).toBe('string');
  });

  it('returns string for non-primitive values', () => {
    expect(inferCellType({ a: 1 })).toBe('string');
    expect(inferCellType([1, 2])).toBe('string');
    expect(inferCellType(10n)).toBe('string');
  });
});

describe('inferColumnType', () => {
  it('returns empty when all samples are empty', () => {
    expect(inferColumnType([null, '', undefined, '  '])).toBe('empty');
  });

  it('returns integer when all non-empty are integers', () => {
    expect(inferColumnType([1, '2', '', 3])).toBe('integer');
  });

  it('returns number when numeric mix includes a float', () => {
    expect(inferColumnType([1, '2.5', 3])).toBe('number');
  });

  it('returns boolean when all non-empty are boolean', () => {
    expect(inferColumnType([true, 'false', '', false])).toBe('boolean');
  });

  it('returns date when all non-empty are dates', () => {
    expect(inferColumnType(['2026-01-01', '', '2026/2/2'])).toBe('date');
  });

  it('returns string for mixed types', () => {
    expect(inferColumnType([1, 'hello'])).toBe('string');
    expect(inferColumnType([true, 5])).toBe('string');
    expect(inferColumnType(['2026-01-01', 'x'])).toBe('string');
  });
});

describe('normalizeValue', () => {
  it('returns null for empty type', () => {
    expect(normalizeValue('anything', 'empty')).toBeNull();
  });

  it('normalizes booleans from bool and string forms', () => {
    expect(normalizeValue(true, 'boolean')).toBe(true);
    expect(normalizeValue('true', 'boolean')).toBe(true);
    expect(normalizeValue(' TRUE ', 'boolean')).toBe(true);
    expect(normalizeValue('false', 'boolean')).toBe(false);
    expect(normalizeValue(0, 'boolean')).toBe(false);
  });

  it('normalizes numbers from number, string and full-width digits', () => {
    expect(normalizeValue(7, 'integer')).toBe(7);
    expect(normalizeValue(' 42 ', 'integer')).toBe(42);
    expect(normalizeValue('１２３', 'number')).toBe(123);
    // Non-string, non-number falls through String() -> 'true' -> NaN.
    expect(normalizeValue(true, 'number')).toBeNaN();
  });

  it('normalizes dates to zero-padded yyyy-mm-dd', () => {
    expect(normalizeValue('2026/6/6', 'date')).toBe('2026-06-06');
    expect(normalizeValue('2026-12-31', 'date')).toBe('2026-12-31');
  });

  it('returns trimmed input for unparseable / out-of-range dates', () => {
    expect(normalizeValue(' not-a-date ', 'date')).toBe('not-a-date');
    expect(normalizeValue('2026-13-40', 'date')).toBe('2026-13-40');
  });

  it('coerces non-string date input via String()', () => {
    expect(normalizeValue(20260606, 'date')).toBe('20260606');
  });

  it('trims strings and coerces non-strings', () => {
    expect(normalizeValue('  hi  ', 'string')).toBe('hi');
    expect(normalizeValue(123, 'string')).toBe('123');
  });
});

describe('detectDuplicateRows', () => {
  it('groups exact duplicate rows', () => {
    const rows = [
      ['Acme Corporation', 'Tokyo'],
      ['Acme Corporation', 'Tokyo'],
      ['Globex', 'Osaka'],
    ];
    expect(detectDuplicateRows(rows)).toEqual([[0, 1]]);
  });

  it('groups near-duplicate rows above the threshold', () => {
    const rows = [
      ['Acme Corporation Limited'],
      ['Acme Corporatron Limited'],
    ];
    expect(detectDuplicateRows(rows, { threshold: 0.7 })).toEqual([[0, 1]]);
  });

  it('excludes pairs below the threshold', () => {
    const rows = [['Apple'], ['Orange Juice Carton']];
    expect(detectDuplicateRows(rows, { threshold: 0.9 })).toEqual([]);
  });

  it('returns no groups when there are no duplicates', () => {
    const rows = [['alpha'], ['bravo'], ['charlie']];
    expect(detectDuplicateRows(rows)).toEqual([]);
  });

  it('compares only the key columns when keyCols is given', () => {
    const rows = [
      ['ID-100', 'Acme Corporation', 'note a'],
      ['ID-100', 'Acme Corporation', 'completely different note text'],
      ['ID-200', 'Globex Industries', 'x'],
    ];
    expect(detectDuplicateRows(rows, { keyCols: [0, 1] })).toEqual([[0, 1]]);
  });

  it('treats short / missing key cells via empty trigram sets', () => {
    const rows = [
      ['a', 'b'],
      ['a'],
    ];
    // keyCol 1 is missing on row 1 -> '' ; row 0 keyCol 1 = 'b' (also <3 chars)
    // both produce empty trigram sets -> jaccard 1 -> grouped.
    expect(detectDuplicateRows(rows, { keyCols: [1] })).toEqual([[0, 1]]);
  });

  it('merges transitively into a single group', () => {
    const rows = [
      ['Acme Corporation'],
      ['Acme Corporation'],
      ['Acme Corporation'],
    ];
    expect(detectDuplicateRows(rows)).toEqual([[0, 1, 2]]);
  });

  it('does not bleed cell boundaries (uses a unit separator)', () => {
    // ['ab','cd'] and ['abc','d'] both concatenate to 'abcd' WITHOUT a
    // separator; the unit separator keeps them distinct -> no false duplicate.
    expect(detectDuplicateRows([['ab', 'cd'], ['abc', 'd']], { threshold: 1 })).toEqual([]);
    expect(detectDuplicateRows([['ab', 'cd'], ['ab', 'cd']], { threshold: 1 })).toEqual([[0, 1]]);
  });

  it('returns multiple groups sorted by smallest member', () => {
    const rows = [
      ['Globex Industries'],
      ['Acme Corporation'],
      ['Globex Industries'],
      ['Acme Corporation'],
    ];
    expect(detectDuplicateRows(rows)).toEqual([
      [0, 2],
      [1, 3],
    ]);
  });

  it('handles empty input', () => {
    expect(detectDuplicateRows([])).toEqual([]);
  });
});

describe('InferredType exhaustiveness', () => {
  it('covers every declared type via normalizeValue', () => {
    const types: InferredType[] = ['integer', 'number', 'boolean', 'date', 'string', 'empty'];
    for (const t of types) {
      expect(() => normalizeValue('1', t)).not.toThrow();
    }
  });
});
