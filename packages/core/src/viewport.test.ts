import { describe, it, expect } from 'vitest';
import { computeVisibleWindow, forEachIndex } from './viewport.js';
import { SizeManager } from './size-manager.js';

const sizes = (count: number, def = 20) => new SizeManager({ count, defaultSize: def });

describe('computeVisibleWindow', () => {
  it('computes a simple window with no frozen or overscan', () => {
    const w = computeVisibleWindow(sizes(100, 20), { scroll: 0, client: 100 });
    expect(w.frozen).toEqual({ start: 0, end: 0 });
    expect(w.frozenSize).toBe(0);
    // 100px / 20px = 5 rows visible -> indices [0,5)
    expect(w.scrollable).toEqual({ start: 0, end: 5 });
  });

  it('shifts the window with scroll', () => {
    const w = computeVisibleWindow(sizes(100, 20), { scroll: 100, client: 100 });
    expect(w.scrollable.start).toBe(5);
    expect(w.scrollable.end).toBe(10);
  });

  it('applies overscan clamped to bounds', () => {
    const w = computeVisibleWindow(sizes(100, 20), { scroll: 100, client: 100, overscan: 2 });
    expect(w.scrollable.start).toBe(3);
    expect(w.scrollable.end).toBe(12);
  });

  it('clamps overscan at the start edge', () => {
    const w = computeVisibleWindow(sizes(100, 20), { scroll: 0, client: 100, overscan: 5 });
    expect(w.scrollable.start).toBe(0);
  });

  it('clamps the end at count', () => {
    const w = computeVisibleWindow(sizes(10, 20), { scroll: 0, client: 1000, overscan: 5 });
    expect(w.scrollable.end).toBe(10);
  });

  it('handles frozen leading indices', () => {
    const w = computeVisibleWindow(sizes(100, 20), {
      scroll: 0,
      client: 100,
      frozenCount: 2,
    });
    expect(w.frozen).toEqual({ start: 0, end: 2 });
    expect(w.frozenSize).toBe(40);
    expect(w.scrollable.start).toBe(2);
  });

  it('never lets the scrollable window dip below frozenCount', () => {
    const w = computeVisibleWindow(sizes(100, 20), {
      scroll: 0,
      client: 100,
      frozenCount: 3,
      overscan: 10,
    });
    expect(w.scrollable.start).toBeGreaterThanOrEqual(3);
  });

  it('returns an empty scrollable window for an empty axis', () => {
    const w = computeVisibleWindow(sizes(0, 20), { scroll: 0, client: 100 });
    expect(w.scrollable).toEqual({ start: 0, end: 0 });
  });

  it('handles frozenCount >= count', () => {
    const w = computeVisibleWindow(sizes(3, 20), { scroll: 0, client: 100, frozenCount: 5 });
    expect(w.frozen).toEqual({ start: 0, end: 3 });
    expect(w.scrollable).toEqual({ start: 3, end: 3 });
    expect(w.frozenSize).toBe(60);
  });

  it('treats negative scroll and client as zero (empty viewport)', () => {
    const w = computeVisibleWindow(sizes(100, 20), { scroll: -50, client: -10 });
    expect(w.scrollable.start).toBe(0);
    expect(w.scrollable.end).toBe(0);
  });

  it('does not over-include a cell whose edge equals the viewport end', () => {
    // client=90 over 20px cells: viewport [0,90) -> cells 0..4 (4 partially)
    const w = computeVisibleWindow(sizes(100, 20), { scroll: 0, client: 90 });
    expect(w.scrollable).toEqual({ start: 0, end: 5 });
  });
});

describe('forEachIndex', () => {
  it('iterates the half-open range', () => {
    const seen: number[] = [];
    forEachIndex({ start: 2, end: 5 }, (i) => seen.push(i));
    expect(seen).toEqual([2, 3, 4]);
  });

  it('does nothing for an empty range', () => {
    const seen: number[] = [];
    forEachIndex({ start: 5, end: 5 }, (i) => seen.push(i));
    expect(seen).toEqual([]);
  });
});
