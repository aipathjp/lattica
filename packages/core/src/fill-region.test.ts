import { describe, it, expect } from 'vitest';

import { fillRegion } from './fill-region.js';
import type { CellValue } from './types.js';

describe('fillRegion', () => {
  describe('guards', () => {
    it('returns [] when count is zero', () => {
      expect(fillRegion([[1, 2]], 'down', 0)).toEqual([]);
    });

    it('returns [] when count is negative', () => {
      expect(fillRegion([[1, 2]], 'right', -3)).toEqual([]);
    });

    it('returns [] for an empty seed (no rows)', () => {
      expect(fillRegion([], 'down', 2)).toEqual([]);
    });

    it('returns [] for a vertical fill when every row has zero width', () => {
      expect(fillRegion([[], []], 'down', 2)).toEqual([]);
    });

    it('returns [] for a horizontal fill when every row has zero width', () => {
      expect(fillRegion([[], []], 'right', 2)).toEqual([]);
    });
  });

  describe('down', () => {
    it('extends each column as its own numeric series into new rows', () => {
      const seed: CellValue[][] = [
        [1, 10],
        [2, 20],
      ];
      // col0: 1,2 -> 3,4 ; col1: 10,20 -> 30,40
      expect(fillRegion(seed, 'down', 2)).toEqual([
        [3, 30],
        [4, 40],
      ]);
    });

    it('uses copy fallback for a non-series column', () => {
      const seed: CellValue[][] = [['a'], ['b']];
      // ['a','b'] is not a progression -> copy cycles a,b,a
      expect(fillRegion(seed, 'down', 3)).toEqual([['a'], ['b'], ['a']]);
    });

    it('fills a ragged seed, padding missing cells with null', () => {
      // Row 1 is shorter than row 0, so column 1 of row 1 reads as null.
      const seed: CellValue[][] = [[1, 5], [2]];
      // col0: 1,2 -> 3,4 ; col1: 5,null -> copy cycle 5,null
      expect(fillRegion(seed, 'down', 2)).toEqual([
        [3, 5],
        [4, null],
      ]);
    });
  });

  describe('up', () => {
    it('continues each column upward and returns rows top-to-bottom', () => {
      // Seed read top-to-bottom is 10,20 (delta +10). Reversed: 20,10 (delta -10)
      // so upward continuation is 0 then -10. In final visual order the topmost
      // produced row is the furthest-up value (-10), then 0.
      const seed: CellValue[][] = [[10], [20]];
      expect(fillRegion(seed, 'up', 2)).toEqual([[-10], [0]]);
    });
  });

  describe('right', () => {
    it('extends each row as its own numeric series into new columns', () => {
      const seed: CellValue[][] = [
        [1, 2],
        [10, 20],
      ];
      // row0: 1,2 -> 3,4 ; row1: 10,20 -> 30,40
      expect(fillRegion(seed, 'right', 2)).toEqual([
        [3, 4],
        [30, 40],
      ]);
    });
  });

  describe('left', () => {
    it('continues each row leftward and returns columns left-to-right', () => {
      // Row 1,2 (delta +1). Reversed 2,1 (delta -1) -> leftward 0,-1. Returned
      // left-to-right the leftmost produced column is -1, then 0.
      const seed: CellValue[][] = [[1, 2]];
      expect(fillRegion(seed, 'left', 2)).toEqual([[-1, 0]]);
    });
  });

  describe('single-cell seed', () => {
    it('copies a single number (delta 0 -> copy fallback) downward', () => {
      expect(fillRegion([[7]], 'down', 3)).toEqual([[7], [7], [7]]);
    });

    it('copies a single number rightward', () => {
      expect(fillRegion([[7]], 'right', 2)).toEqual([[7, 7]]);
    });
  });
});
