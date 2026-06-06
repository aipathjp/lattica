import { describe, it, expect } from 'vitest';
import {
  type GridStateSnapshot,
  serializeState,
  deserializeState,
  emptyState,
} from './persistent-state.js';

describe('emptyState', () => {
  it('returns a fresh version-1 snapshot with no other fields', () => {
    const s = emptyState();
    expect(s).toEqual({ version: 1 });
    // Each call yields an independent object.
    expect(emptyState()).not.toBe(s);
  });
});

describe('round-trip', () => {
  it('preserves a full snapshot', () => {
    const full: GridStateSnapshot = {
      version: 1,
      columnWidths: { 0: 120, 3: 80 },
      rowHeights: { 1: 24, 10: 48 },
      hiddenColumns: [2, 5],
      hiddenRows: [7],
      columnOrder: [0, 2, 1, 3],
      sort: [
        { col: 1, direction: 'asc' },
        { col: 2, direction: 'desc' },
      ],
      frozenRows: 1,
      frozenCols: 2,
    };
    expect(deserializeState(serializeState(full))).toEqual(full);
  });

  it('preserves an empty snapshot', () => {
    expect(deserializeState(serializeState(emptyState()))).toEqual({ version: 1 });
  });

  it('preserves a partial snapshot', () => {
    const partial: GridStateSnapshot = {
      version: 1,
      hiddenColumns: [1],
      frozenRows: 0,
    };
    expect(deserializeState(serializeState(partial))).toEqual(partial);
  });

  it('allows negative integers in index arrays and counts', () => {
    const s: GridStateSnapshot = {
      version: 1,
      hiddenRows: [-1, 0, 5],
      frozenCols: -3,
    };
    expect(deserializeState(serializeState(s))).toEqual(s);
  });
});

describe('deserializeState validation', () => {
  it('throws on malformed JSON', () => {
    expect(() => deserializeState('{not json')).toThrow(/not valid JSON/);
  });

  it('throws when root is not an object (array)', () => {
    expect(() => deserializeState('[]')).toThrow(/root must be an object/);
  });

  it('throws when root is not an object (null)', () => {
    expect(() => deserializeState('null')).toThrow(/root must be an object/);
  });

  it('throws when root is a primitive', () => {
    expect(() => deserializeState('42')).toThrow(/root must be an object/);
  });

  it('throws on missing version', () => {
    expect(() => deserializeState('{}')).toThrow(/version must be 1/);
  });

  it('throws on wrong version', () => {
    expect(() => deserializeState('{"version":2}')).toThrow(/version must be 1/);
  });

  it('strips unknown top-level fields', () => {
    const json = '{"version":1,"frozenRows":2,"bogus":"x","extra":99}';
    const result = deserializeState(json);
    expect(result).toEqual({ version: 1, frozenRows: 2 });
    expect('bogus' in result).toBe(false);
  });
});

describe('columnWidths / rowHeights map validation', () => {
  it('throws when columnWidths is not an object', () => {
    expect(() => deserializeState('{"version":1,"columnWidths":[]}')).toThrow(
      /columnWidths must be an object/,
    );
  });

  it('throws when rowHeights is null', () => {
    expect(() => deserializeState('{"version":1,"rowHeights":null}')).toThrow(
      /rowHeights must be an object/,
    );
  });

  it('throws on a non-integer key', () => {
    expect(() => deserializeState('{"version":1,"columnWidths":{"1.5":10}}')).toThrow(
      /non-integer key/,
    );
  });

  it('throws on a non-numeric key', () => {
    expect(() => deserializeState('{"version":1,"columnWidths":{"a":10}}')).toThrow(
      /non-integer key/,
    );
  });

  it('throws on a non-finite value', () => {
    // JSON cannot encode Infinity, so a string value triggers the value guard.
    expect(() => deserializeState('{"version":1,"columnWidths":{"0":"wide"}}')).toThrow(
      /must be a finite number/,
    );
  });
});

describe('integer array validation', () => {
  it('throws when hiddenColumns is not an array', () => {
    expect(() => deserializeState('{"version":1,"hiddenColumns":{}}')).toThrow(
      /hiddenColumns must be an array/,
    );
  });

  it('throws when hiddenRows contains a non-integer', () => {
    expect(() => deserializeState('{"version":1,"hiddenRows":[1,2.5]}')).toThrow(
      /hiddenRows must contain only integers/,
    );
  });

  it('throws when columnOrder contains a string', () => {
    expect(() => deserializeState('{"version":1,"columnOrder":[0,"1"]}')).toThrow(
      /columnOrder must contain only integers/,
    );
  });
});

describe('sort validation', () => {
  it('throws when sort is not an array', () => {
    expect(() => deserializeState('{"version":1,"sort":{}}')).toThrow(/sort must be an array/);
  });

  it('throws when a sort entry is not an object', () => {
    expect(() => deserializeState('{"version":1,"sort":[1]}')).toThrow(
      /sort entries must be objects/,
    );
  });

  it('throws when a sort entry col is not an integer', () => {
    expect(() => deserializeState('{"version":1,"sort":[{"col":1.5,"direction":"asc"}]}')).toThrow(
      /sort entry col must be an integer/,
    );
  });

  it('throws on an invalid direction', () => {
    expect(() => deserializeState('{"version":1,"sort":[{"col":1,"direction":"up"}]}')).toThrow(
      /direction must be "asc" or "desc"/,
    );
  });
});

describe('frozenRows / frozenCols validation', () => {
  it('throws when frozenRows is not an integer', () => {
    expect(() => deserializeState('{"version":1,"frozenRows":1.5}')).toThrow(
      /frozenRows must be an integer/,
    );
  });

  it('throws when frozenCols is not an integer', () => {
    expect(() => deserializeState('{"version":1,"frozenCols":"2"}')).toThrow(
      /frozenCols must be an integer/,
    );
  });
});
