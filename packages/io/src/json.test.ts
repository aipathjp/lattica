import { describe, it, expect } from 'vitest';
import type { CellValue } from '@lattica/core';
import {
  matrixToJson,
  jsonToMatrix,
  recordsToMatrix,
  matrixToRecords,
} from './json.js';

describe('matrixToJson / jsonToMatrix', () => {
  it('round-trips a matrix of all cell types', () => {
    const matrix: CellValue[][] = [
      ['a', 1, true],
      [null, -2.5, 'b'],
      [],
    ];
    const json = matrixToJson(matrix);
    expect(json).toBe('[["a",1,true],[null,-2.5,"b"],[]]');
    expect(jsonToMatrix(json)).toEqual(matrix);
  });

  it('throws on malformed JSON', () => {
    expect(() => jsonToMatrix('{not json')).toThrow(/malformed JSON/);
  });

  it('throws when the top level is not an array', () => {
    expect(() => jsonToMatrix('{"a":1}')).toThrow(/not an array/);
  });

  it('throws when a row is not an array', () => {
    expect(() => jsonToMatrix('[["ok"],"nope"]')).toThrow(/row is not an array/);
  });

  it('throws on an invalid cell type', () => {
    expect(() => jsonToMatrix('[[{"x":1}]]')).toThrow(/invalid cell type/);
  });

  it('accepts an empty matrix', () => {
    expect(jsonToMatrix('[]')).toEqual([]);
  });
});

describe('recordsToMatrix', () => {
  it('infers columns as union of keys in first-seen order', () => {
    const result = recordsToMatrix([
      { a: 1, b: 2 },
      { b: 3, c: 4 },
    ]);
    expect(result.headers).toEqual(['a', 'b', 'c']);
    expect(result.rows).toEqual([
      [1, 2, null],
      [null, 3, 4],
    ]);
  });

  it('uses explicit columns and fills missing keys with null', () => {
    const result = recordsToMatrix(
      [
        { a: 1, b: 2, z: 9 },
        { a: 5 },
      ],
      ['a', 'b'],
    );
    expect(result.headers).toEqual(['a', 'b']);
    expect(result.rows).toEqual([
      [1, 2],
      [5, null],
    ]);
  });

  it('handles an empty record array', () => {
    expect(recordsToMatrix([])).toEqual({ headers: [], rows: [] });
  });

  it('normalizes an own key with an undefined value to null', () => {
    const result = recordsToMatrix(
      [{ a: undefined } as unknown as Record<string, never>],
      ['a'],
    );
    expect(result.rows).toEqual([[null]]);
  });

  it('preserves boolean, number, and null values', () => {
    const result = recordsToMatrix([{ a: false, b: 0, c: null }], ['a', 'b', 'c']);
    expect(result.rows).toEqual([[false, 0, null]]);
  });
});

describe('matrixToRecords', () => {
  it('inverts recordsToMatrix', () => {
    const records = [
      { a: 1, b: 'x' },
      { a: 2, b: 'y' },
    ];
    const { headers, rows } = recordsToMatrix(records);
    expect(matrixToRecords(headers, rows)).toEqual(records);
  });

  it('ignores extra cells beyond headers and fills missing cells with null', () => {
    const result = matrixToRecords(
      ['a', 'b'],
      [
        [1, 2, 99], // extra cell ignored
        [3], // missing cell -> null
      ],
    );
    expect(result).toEqual([
      { a: 1, b: 2 },
      { a: 3, b: null },
    ]);
  });
});
