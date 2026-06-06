import { describe, it, expect, vi } from 'vitest';
import { MergeModel, type MergeArea } from './merge.js';

const area = (row: number, col: number, rowspan: number, colspan: number): MergeArea => ({
  row,
  col,
  rowspan,
  colspan,
});

describe('MergeModel.add / list', () => {
  it('stores a merge and lists a copy', () => {
    const m = new MergeModel();
    m.add(area(1, 1, 2, 3));
    const list = m.list();
    expect(list).toEqual([area(1, 1, 2, 3)]);
    // Mutating the snapshot does not affect internal state.
    list[0]!.rowspan = 99;
    expect(m.list()).toEqual([area(1, 1, 2, 3)]);
  });

  it('stores multiple non-overlapping merges', () => {
    const m = new MergeModel();
    m.add(area(0, 0, 1, 1));
    m.add(area(5, 5, 2, 2));
    expect(m.list()).toHaveLength(2);
  });

  it('normalizes spans of 1', () => {
    const m = new MergeModel();
    m.add(area(3, 4, 1, 1));
    expect(m.list()).toEqual([area(3, 4, 1, 1)]);
  });
});

describe('MergeModel.add overlap rejection', () => {
  it('throws when a new merge overlaps an existing one', () => {
    const m = new MergeModel();
    m.add(area(1, 1, 2, 2));
    expect(() => m.add(area(2, 2, 2, 2))).toThrow(RangeError);
    expect(() => m.add(area(2, 2, 2, 2))).toThrow(/overlaps existing merge at \(1,1\)/);
    // Failed add must not alter state.
    expect(m.list()).toHaveLength(1);
  });

  it('allows adjacent merges that only touch edges', () => {
    const m = new MergeModel();
    m.add(area(0, 0, 1, 1));
    expect(() => m.add(area(0, 1, 1, 1))).not.toThrow();
    expect(() => m.add(area(1, 0, 1, 1))).not.toThrow();
    expect(m.list()).toHaveLength(3);
  });
});

describe('MergeModel.add invalid span', () => {
  it('throws RangeError for rowspan < 1', () => {
    const m = new MergeModel();
    expect(() => m.add(area(0, 0, 0, 2))).toThrow(RangeError);
    expect(() => m.add(area(0, 0, 0, 2))).toThrow(/span must be >= 1/);
  });

  it('throws RangeError for colspan < 1', () => {
    const m = new MergeModel();
    expect(() => m.add(area(0, 0, 2, 0))).toThrow(RangeError);
  });

  it('does not store an invalid merge', () => {
    const m = new MergeModel();
    expect(() => m.add(area(0, 0, -1, -1))).toThrow(RangeError);
    expect(m.list()).toHaveLength(0);
  });
});

describe('MergeModel.getMergeAt', () => {
  it('returns the area for the anchor cell', () => {
    const m = new MergeModel();
    m.add(area(1, 1, 2, 3));
    expect(m.getMergeAt(1, 1)).toEqual(area(1, 1, 2, 3));
  });

  it('returns the area for a covered cell inside the block', () => {
    const m = new MergeModel();
    m.add(area(1, 1, 2, 3));
    expect(m.getMergeAt(2, 3)).toEqual(area(1, 1, 2, 3));
  });

  it('returns null for a cell outside any merge', () => {
    const m = new MergeModel();
    m.add(area(1, 1, 2, 3));
    expect(m.getMergeAt(0, 0)).toBeNull();
    expect(m.getMergeAt(3, 1)).toBeNull();
    expect(m.getMergeAt(1, 4)).toBeNull();
  });

  it('returns a copy, not the internal reference', () => {
    const m = new MergeModel();
    m.add(area(1, 1, 2, 3));
    const got = m.getMergeAt(1, 1)!;
    got.rowspan = 99;
    expect(m.getMergeAt(1, 1)).toEqual(area(1, 1, 2, 3));
  });
});

describe('MergeModel.isAnchor / isCovered', () => {
  it('distinguishes anchor, covered, and outside cells', () => {
    const m = new MergeModel();
    m.add(area(1, 1, 2, 2));

    expect(m.isAnchor(1, 1)).toBe(true);
    expect(m.isAnchor(1, 2)).toBe(false);
    expect(m.isAnchor(5, 5)).toBe(false);

    expect(m.isCovered(1, 1)).toBe(false); // anchor is not covered
    expect(m.isCovered(1, 2)).toBe(true);
    expect(m.isCovered(2, 2)).toBe(true);
    expect(m.isCovered(5, 5)).toBe(false); // outside any merge
  });
});

describe('MergeModel.remove', () => {
  it('removes the merge whose anchor matches and returns true', () => {
    const m = new MergeModel();
    m.add(area(1, 1, 2, 2));
    expect(m.remove(1, 1)).toBe(true);
    expect(m.list()).toHaveLength(0);
  });

  it('returns false when removing by a non-anchor (covered) cell', () => {
    const m = new MergeModel();
    m.add(area(1, 1, 2, 2));
    expect(m.remove(2, 2)).toBe(false);
    expect(m.list()).toHaveLength(1);
  });

  it('returns false when no merge has that anchor', () => {
    const m = new MergeModel();
    expect(m.remove(0, 0)).toBe(false);
  });

  it('removes only the matching merge', () => {
    const m = new MergeModel();
    m.add(area(0, 0, 1, 1));
    m.add(area(5, 5, 2, 2));
    expect(m.remove(0, 0)).toBe(true);
    expect(m.list()).toEqual([area(5, 5, 2, 2)]);
  });
});

describe('MergeModel.clear', () => {
  it('removes all merges', () => {
    const m = new MergeModel();
    m.add(area(0, 0, 1, 1));
    m.add(area(5, 5, 2, 2));
    m.clear();
    expect(m.list()).toHaveLength(0);
  });

  it('is a no-op (and emits nothing) when already empty', () => {
    const m = new MergeModel();
    const listener = vi.fn();
    m.subscribe(listener);
    m.clear();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('MergeModel.subscribe', () => {
  it('notifies listeners on add, remove, and clear', () => {
    const m = new MergeModel();
    const listener = vi.fn();
    m.subscribe(listener);

    m.add(area(0, 0, 1, 1));
    expect(listener).toHaveBeenCalledTimes(1);

    m.remove(0, 0);
    expect(listener).toHaveBeenCalledTimes(2);

    m.add(area(2, 2, 1, 1));
    m.clear();
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('does not notify a failed (overlapping/invalid) add', () => {
    const m = new MergeModel();
    m.add(area(0, 0, 2, 2));
    const listener = vi.fn();
    m.subscribe(listener);
    expect(() => m.add(area(1, 1, 1, 1))).toThrow();
    expect(() => m.add(area(0, 0, 0, 0))).toThrow();
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not notify a remove that removed nothing', () => {
    const m = new MergeModel();
    const listener = vi.fn();
    m.subscribe(listener);
    expect(m.remove(0, 0)).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('stops notifying after unsubscribe', () => {
    const m = new MergeModel();
    const listener = vi.fn();
    const unsubscribe = m.subscribe(listener);
    m.add(area(0, 0, 1, 1));
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    m.add(area(2, 2, 1, 1));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('notifies multiple listeners', () => {
    const m = new MergeModel();
    const a = vi.fn();
    const b = vi.fn();
    m.subscribe(a);
    m.subscribe(b);
    m.add(area(0, 0, 1, 1));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
