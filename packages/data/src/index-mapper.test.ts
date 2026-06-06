import { describe, it, expect, vi } from 'vitest';

import { IndexMapper } from './index-mapper.js';

describe('IndexMapper', () => {
  describe('construction & identity', () => {
    it('builds an identity order 0..length-1', () => {
      const m = new IndexMapper(4);
      expect(m.length).toBe(4);
      expect(m.visibleCount).toBe(4);
      expect(m.getVisibleIndexes()).toEqual([0, 1, 2, 3]);
      expect(m.getHidden()).toEqual([]);
      for (let i = 0; i < 4; i++) {
        expect(m.getPhysicalIndex(i)).toBe(i);
        expect(m.getVisualIndex(i)).toBe(i);
        expect(m.isHidden(i)).toBe(false);
      }
    });

    it('supports an empty mapper', () => {
      const m = new IndexMapper(0);
      expect(m.length).toBe(0);
      expect(m.visibleCount).toBe(0);
      expect(m.getVisibleIndexes()).toEqual([]);
      expect(m.getPhysicalIndex(0)).toBe(-1);
      expect(m.getVisualIndex(0)).toBe(-1);
    });

    it('throws RangeError on negative length', () => {
      expect(() => new IndexMapper(-1)).toThrow(RangeError);
    });
  });

  describe('out-of-range lookups', () => {
    it('returns -1 for out-of-range visual and physical', () => {
      const m = new IndexMapper(3);
      expect(m.getPhysicalIndex(-1)).toBe(-1);
      expect(m.getPhysicalIndex(3)).toBe(-1);
      expect(m.getPhysicalIndex(99)).toBe(-1);
      expect(m.getVisualIndex(-1)).toBe(-1);
      expect(m.getVisualIndex(3)).toBe(-1);
      expect(m.getVisualIndex(99)).toBe(-1);
    });
  });

  describe('hide / unhide', () => {
    it('hides indices and shifts visible positions', () => {
      const m = new IndexMapper(5);
      m.setHidden([1, 3], true);
      expect(m.visibleCount).toBe(3);
      expect(m.getVisibleIndexes()).toEqual([0, 2, 4]);
      expect(m.isHidden(1)).toBe(true);
      expect(m.isHidden(3)).toBe(true);
      expect(m.isHidden(0)).toBe(false);
      expect(m.getVisualIndex(1)).toBe(-1);
      expect(m.getVisualIndex(3)).toBe(-1);
      expect(m.getVisualIndex(2)).toBe(1);
      expect(m.getVisualIndex(4)).toBe(2);
      expect(m.getPhysicalIndex(0)).toBe(0);
      expect(m.getPhysicalIndex(1)).toBe(2);
      expect(m.getPhysicalIndex(2)).toBe(4);
      expect(m.getPhysicalIndex(3)).toBe(-1);
    });

    it('unhides indices, restoring their original slot', () => {
      const m = new IndexMapper(5);
      m.setHidden([1, 3], true);
      m.setHidden([1], false);
      expect(m.getVisibleIndexes()).toEqual([0, 1, 2, 4]);
      expect(m.isHidden(1)).toBe(false);
      expect(m.isHidden(3)).toBe(true);
    });

    it('ignores duplicate and out-of-range entries', () => {
      const m = new IndexMapper(3);
      m.setHidden([1, 1, 5, -2], true);
      expect(m.getHidden()).toEqual([1]);
      expect(m.visibleCount).toBe(2);
    });

    it('getHidden returns sorted ascending', () => {
      const m = new IndexMapper(6);
      m.setHidden([4, 0, 2], true);
      expect(m.getHidden()).toEqual([0, 2, 4]);
    });
  });

  describe('round-trips after hide + move', () => {
    it('keeps getPhysicalIndex/getVisualIndex consistent', () => {
      const m = new IndexMapper(6); // 0 1 2 3 4 5
      m.setHidden([2], true); // visible: 0 1 3 4 5
      m.move(0, 2, 5); // move visible run [0,1] to the end
      const visible = m.getVisibleIndexes();
      expect(visible).toEqual([3, 4, 5, 0, 1]);
      for (let v = 0; v < visible.length; v++) {
        const p = m.getPhysicalIndex(v);
        expect(p).toBe(visible[v]);
        expect(m.getVisualIndex(p)).toBe(v);
      }
      // Hidden remains hidden and stays in stable order slot.
      expect(m.isHidden(2)).toBe(true);
      expect(m.getVisualIndex(2)).toBe(-1);
    });
  });

  describe('move', () => {
    it('moves a run backward (toward the start)', () => {
      const m = new IndexMapper(5); // 0 1 2 3 4
      m.move(3, 1, 1); // move [3] before visual position 1
      expect(m.getVisibleIndexes()).toEqual([0, 3, 1, 2, 4]);
    });

    it('moves a run forward (toward the end)', () => {
      const m = new IndexMapper(5);
      m.move(1, 2, 4); // move [1,2] before visual position 4
      expect(m.getVisibleIndexes()).toEqual([0, 3, 1, 2, 4]);
    });

    it('moves a run to the very end (append branch)', () => {
      const m = new IndexMapper(4);
      m.move(0, 1, 4); // toVisual === visibleCount
      expect(m.getVisibleIndexes()).toEqual([1, 2, 3, 0]);
    });

    it('treats a move into its own range as a no-op (toVisual within run)', () => {
      const m = new IndexMapper(5);
      m.move(1, 2, 2); // toVisual inside [1,3)
      expect(m.getVisibleIndexes()).toEqual([0, 1, 2, 3, 4]);
    });

    it('treats a move immediately after the run as a no-op', () => {
      const m = new IndexMapper(5);
      m.move(1, 2, 3); // toVisual === fromVisual + count
      expect(m.getVisibleIndexes()).toEqual([0, 1, 2, 3, 4]);
    });

    it('treats a move to its own start as a no-op', () => {
      const m = new IndexMapper(5);
      m.move(2, 1, 2); // toVisual === fromVisual
      expect(m.getVisibleIndexes()).toEqual([0, 1, 2, 3, 4]);
    });

    it('ignores out-of-range / invalid moves', () => {
      const m = new IndexMapper(4);
      m.move(-1, 1, 0); // fromVisual < 0
      m.move(0, 0, 1); // count <= 0
      m.move(2, 5, 0); // fromVisual + count > visibleCount
      m.move(0, 1, -1); // toVisual < 0
      m.move(0, 1, 5); // toVisual > visibleCount
      expect(m.getVisibleIndexes()).toEqual([0, 1, 2, 3]);
    });

    it('moves correctly when hidden items sit between visible ones', () => {
      const m = new IndexMapper(5); // 0 1 2 3 4
      m.setHidden([2], true); // visible: 0 1 3 4
      m.move(2, 1, 0); // move visible [3] to front
      expect(m.getVisibleIndexes()).toEqual([3, 0, 1, 4]);
      // The hidden item 2 stays in the stable order between former neighbours.
      expect(m.isHidden(2)).toBe(true);
    });
  });

  describe('setOrder', () => {
    it('replaces the visual order with a valid permutation', () => {
      const m = new IndexMapper(4);
      m.setOrder([3, 1, 0, 2]);
      expect(m.getVisibleIndexes()).toEqual([3, 1, 0, 2]);
      expect(m.getPhysicalIndex(0)).toBe(3);
      expect(m.getVisualIndex(3)).toBe(0);
    });

    it('preserves the hidden set across reordering', () => {
      const m = new IndexMapper(4);
      m.setHidden([1], true);
      m.setOrder([3, 1, 0, 2]);
      expect(m.isHidden(1)).toBe(true);
      expect(m.getVisibleIndexes()).toEqual([3, 0, 2]);
    });

    it('throws on wrong length', () => {
      const m = new IndexMapper(3);
      expect(() => m.setOrder([0, 1])).toThrow(RangeError);
      expect(() => m.setOrder([0, 1, 2, 3])).toThrow(RangeError);
    });

    it('throws on duplicate entries', () => {
      const m = new IndexMapper(3);
      expect(() => m.setOrder([0, 1, 1])).toThrow(RangeError);
    });

    it('throws on out-of-range entries', () => {
      const m = new IndexMapper(3);
      expect(() => m.setOrder([0, 1, 5])).toThrow(RangeError);
      expect(() => m.setOrder([0, 1, -1])).toThrow(RangeError);
    });

    it('throws on non-integer entries', () => {
      const m = new IndexMapper(3);
      expect(() => m.setOrder([0, 1, 1.5])).toThrow(RangeError);
    });
  });

  describe('insert', () => {
    it('inserts at the start', () => {
      const m = new IndexMapper(3); // 0 1 2
      m.insert(0, 2);
      expect(m.length).toBe(5);
      expect(m.getVisibleIndexes()).toEqual([0, 1, 2, 3, 4]);
    });

    it('inserts in the middle', () => {
      const m = new IndexMapper(3); // 0 1 2
      m.insert(1, 2);
      expect(m.length).toBe(5);
      // existing 1,2 became 3,4; new are 1,2
      expect(m.getVisibleIndexes()).toEqual([0, 1, 2, 3, 4]);
    });

    it('inserts at the end (append branch)', () => {
      const m = new IndexMapper(3);
      m.insert(3, 2);
      expect(m.length).toBe(5);
      expect(m.getVisibleIndexes()).toEqual([0, 1, 2, 3, 4]);
    });

    it('clamps atPhysical beyond the end to length', () => {
      const m = new IndexMapper(2);
      m.insert(99, 1);
      expect(m.length).toBe(3);
      expect(m.getVisibleIndexes()).toEqual([0, 1, 2]);
    });

    it('clamps negative atPhysical to 0', () => {
      const m = new IndexMapper(2);
      m.insert(-5, 1);
      expect(m.length).toBe(3);
      expect(m.getVisibleIndexes()).toEqual([0, 1, 2]);
    });

    it('is a no-op for count <= 0', () => {
      const m = new IndexMapper(3);
      m.insert(1, 0);
      expect(m.length).toBe(3);
      m.insert(1, -2);
      expect(m.length).toBe(3);
      expect(m.getVisibleIndexes()).toEqual([0, 1, 2]);
    });

    it('remaps hidden indices across an insert', () => {
      const m = new IndexMapper(4); // 0 1 2 3
      m.setHidden([0, 2], true);
      m.insert(2, 1); // physical >=2 shift up by 1; new index 2 is visible
      expect(m.length).toBe(5);
      // hidden 0 stays 0, hidden 2 -> 3
      expect(m.getHidden()).toEqual([0, 3]);
      // visible order: 1, 2(new), 4
      expect(m.getVisibleIndexes()).toEqual([1, 2, 4]);
    });

    it('respects a reordered visual order when inserting', () => {
      const m = new IndexMapper(3); // physical 0 1 2
      m.setOrder([2, 0, 1]); // visual: 2 0 1
      m.insert(1, 1); // physical >=1 shift up: 2->3, 1->2; new index 1
      // order entries: 3, 0, 2 ; new 1 spliced before shifted entry (at+count===2)
      expect(m.getVisibleIndexes()).toEqual([3, 0, 1, 2]);
    });
  });

  describe('remove', () => {
    it('removes a single index and renumbers', () => {
      const m = new IndexMapper(4); // 0 1 2 3
      m.remove([1]);
      expect(m.length).toBe(3);
      expect(m.getVisibleIndexes()).toEqual([0, 1, 2]); // old 2,3 -> 1,2
    });

    it('removes multiple indices', () => {
      const m = new IndexMapper(5); // 0 1 2 3 4
      m.remove([1, 3]);
      expect(m.length).toBe(3);
      expect(m.getVisibleIndexes()).toEqual([0, 1, 2]); // old 0,2,4
    });

    it('drops removed indices from the hidden set and remaps survivors', () => {
      const m = new IndexMapper(5); // 0 1 2 3 4
      m.setHidden([1, 4], true);
      m.remove([1]); // remove a hidden one; survivor hidden 4 -> 3
      expect(m.length).toBe(4);
      expect(m.getHidden()).toEqual([3]);
      expect(m.getVisibleIndexes()).toEqual([0, 1, 2]); // old 0,2,3
    });

    it('preserves a reordered visual order through removal', () => {
      const m = new IndexMapper(4);
      m.setOrder([3, 2, 1, 0]);
      m.remove([2]); // survivors 3,1,0 renumbered: 0->0,1->1,3->2
      expect(m.getVisibleIndexes()).toEqual([2, 1, 0]);
    });

    it('ignores out-of-range and duplicate entries', () => {
      const m = new IndexMapper(3);
      m.remove([1, 1, 9, -1]);
      expect(m.length).toBe(2);
      expect(m.getVisibleIndexes()).toEqual([0, 1]);
    });

    it('is a no-op (but notifies) when nothing valid is removed', () => {
      const m = new IndexMapper(3);
      const listener = vi.fn();
      m.subscribe(listener);
      m.remove([9, -1]);
      expect(m.length).toBe(3);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('reset', () => {
    it('returns to identity of the new length, clearing hidden & order', () => {
      const m = new IndexMapper(3);
      m.setHidden([0], true);
      m.setOrder([2, 1, 0]);
      m.reset(2);
      expect(m.length).toBe(2);
      expect(m.visibleCount).toBe(2);
      expect(m.getHidden()).toEqual([]);
      expect(m.getVisibleIndexes()).toEqual([0, 1]);
    });

    it('throws RangeError on negative length', () => {
      const m = new IndexMapper(3);
      expect(() => m.reset(-1)).toThrow(RangeError);
    });
  });

  describe('subscribe', () => {
    it('notifies on every mutation', () => {
      const m = new IndexMapper(3);
      const listener = vi.fn();
      m.subscribe(listener);
      m.setHidden([0], true);
      m.move(0, 1, 2);
      m.setOrder([0, 1, 2]);
      m.insert(0, 1);
      m.remove([0]);
      m.reset(2);
      expect(listener).toHaveBeenCalledTimes(6);
    });

    it('stops notifying after unsubscribe', () => {
      const m = new IndexMapper(3);
      const listener = vi.fn();
      const unsubscribe = m.subscribe(listener);
      m.setHidden([0], true);
      unsubscribe();
      m.setHidden([1], true);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('supports multiple independent subscribers', () => {
      const m = new IndexMapper(2);
      const a = vi.fn();
      const b = vi.fn();
      m.subscribe(a);
      m.subscribe(b);
      m.reset(2);
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
    });
  });
});
