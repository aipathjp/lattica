import { describe, it, expect } from 'vitest';
import { SizeManager } from './size-manager.js';

const make = (count = 100, defaultSize = 20, minSize?: number) =>
  new SizeManager(minSize === undefined ? { count, defaultSize } : { count, defaultSize, minSize });

describe('SizeManager construction', () => {
  it('rejects invalid count or defaultSize', () => {
    expect(() => new SizeManager({ count: -1, defaultSize: 20 })).toThrow(RangeError);
    expect(() => new SizeManager({ count: 10, defaultSize: 0 })).toThrow(RangeError);
    expect(() => new SizeManager({ count: 10, defaultSize: -5 })).toThrow(RangeError);
  });

  it('exposes count', () => {
    expect(make(50).getCount()).toBe(50);
  });
});

describe('uniform sizing', () => {
  const sm = make(100, 20);
  it('computes total size', () => {
    expect(sm.getTotalSize()).toBe(2000);
  });
  it('computes offsets arithmetically', () => {
    expect(sm.getOffset(0)).toBe(0);
    expect(sm.getOffset(5)).toBe(100);
    expect(sm.getOffset(100)).toBe(2000);
  });
  it('clamps negative index offset to 0', () => {
    expect(sm.getOffset(-3)).toBe(0);
  });
  it('maps offset back to index', () => {
    expect(sm.getIndexAt(0)).toBe(0);
    expect(sm.getIndexAt(19)).toBe(0);
    expect(sm.getIndexAt(20)).toBe(1);
    expect(sm.getIndexAt(105)).toBe(5);
  });
  it('clamps out-of-range offsets', () => {
    expect(sm.getIndexAt(-10)).toBe(0);
    expect(sm.getIndexAt(99999)).toBe(99);
  });
});

describe('variable sizing with overrides', () => {
  it('reflects overrides in size, total, and offset', () => {
    const sm = make(10, 20);
    sm.setSize(2, 50); // +30
    sm.setSize(5, 10); // -10
    expect(sm.getSize(2)).toBe(50);
    expect(sm.getSize(5)).toBe(10);
    expect(sm.getSize(0)).toBe(20);
    expect(sm.getTotalSize()).toBe(10 * 20 + 30 - 10);
    // offset(3) = 3*20 + extra from index 2 (=30) = 90
    expect(sm.getOffset(3)).toBe(90);
    // offset(6) = 6*20 + (30 - 10) = 140
    expect(sm.getOffset(6)).toBe(140);
  });

  it('maps offsets through overridden regions', () => {
    const sm = make(5, 20);
    sm.setSize(0, 100);
    // index 0 spans [0,100), index 1 spans [100,120)
    expect(sm.getIndexAt(50)).toBe(0);
    expect(sm.getIndexAt(100)).toBe(1);
    expect(sm.getIndexAt(119)).toBe(1);
    expect(sm.getIndexAt(120)).toBe(2);
  });

  it('clamps override to minSize', () => {
    const sm = make(10, 20, 5);
    sm.setSize(0, 1);
    expect(sm.getSize(0)).toBe(5);
  });

  it('resets an override', () => {
    const sm = make(10, 20);
    sm.setSize(3, 80);
    expect(sm.getSize(3)).toBe(80);
    sm.resetSize(3);
    expect(sm.getSize(3)).toBe(20);
    expect(sm.getTotalSize()).toBe(200);
    // resetting a non-existent override is a no-op
    sm.resetSize(9);
    expect(sm.getTotalSize()).toBe(200);
  });

  it('rejects out-of-bounds setSize', () => {
    const sm = make(10, 20);
    expect(() => sm.setSize(-1, 30)).toThrow(RangeError);
    expect(() => sm.setSize(10, 30)).toThrow(RangeError);
  });
});

describe('setCount', () => {
  it('grows and shrinks, dropping out-of-range overrides', () => {
    const sm = make(10, 20);
    sm.setSize(8, 50);
    sm.setCount(5);
    expect(sm.getCount()).toBe(5);
    expect(sm.getTotalSize()).toBe(100); // override at 8 dropped
    sm.setCount(20);
    expect(sm.getTotalSize()).toBe(400);
  });

  it('rejects negative count', () => {
    expect(() => make(10).setCount(-1)).toThrow(RangeError);
  });
});

describe('empty axis', () => {
  it('handles zero count gracefully', () => {
    const sm = make(0, 20);
    expect(sm.getTotalSize()).toBe(0);
    expect(sm.getIndexAt(10)).toBe(0);
    expect(sm.getOffset(0)).toBe(0);
  });
});

describe('offset/index round-trip with mixed overrides', () => {
  it('is consistent for every index', () => {
    const sm = make(200, 24);
    sm.setSize(10, 60);
    sm.setSize(50, 12);
    sm.setSize(150, 100);
    for (let i = 0; i < 200; i++) {
      const off = sm.getOffset(i);
      // The index at the leading edge of i is i itself.
      expect(sm.getIndexAt(off)).toBe(i);
    }
  });
});
