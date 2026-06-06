import { describe, it, expect } from 'vitest';
import { SizeManager } from '@lattica/core';
import { hitColumnBorder, hitRowBorder, hitResizeHandle } from './resize.js';
import type { GridGeometry } from './geometry.js';

const geom = (overrides: Partial<GridGeometry> = {}): GridGeometry => ({
  rowSizes: new SizeManager({ count: 100, defaultSize: 20 }),
  colSizes: new SizeManager({ count: 50, defaultSize: 50 }),
  frozenRows: 0,
  frozenCols: 0,
  rowHeaderWidth: 40,
  colHeaderHeight: 20,
  ...overrides,
});

// Column borders (default width 50, rowHeaderWidth 40): col0 right=90, col1=140.
// Row borders (default height 20, colHeaderHeight 20): row0 bottom=40, row1=60.

describe('hitColumnBorder', () => {
  it('returns the column whose right border is just right of the pointer', () => {
    const g = geom();
    // x=89 is 1px left of col0 right edge (90), within the header band (y<20).
    expect(hitColumnBorder(g, 0, 89, 10)).toEqual({ type: 'col', index: 0 });
  });

  it('detects the left-neighbour border when the pointer is in the next column', () => {
    const g = geom();
    // x=91 sits just inside col1 but nearest border is col0's right edge (90).
    expect(hitColumnBorder(g, 0, 91, 10)).toEqual({ type: 'col', index: 0 });
  });

  it('returns null in the body of a column (far from any border)', () => {
    const g = geom();
    // x=65 is mid col0, > tolerance from border 90.
    expect(hitColumnBorder(g, 0, 65, 10)).toBeNull();
  });

  it('returns null outside the column-header band (y below header)', () => {
    const g = geom();
    expect(hitColumnBorder(g, 0, 89, 25)).toBeNull();
  });

  it('returns null left of the row header', () => {
    const g = geom();
    expect(hitColumnBorder(g, 0, 30, 10)).toBeNull();
  });

  it('honours the tolerance boundary (inclusive)', () => {
    const g = geom();
    // Border at 90; default tolerance 4: x=86 (dist 4) hits, x=85 (dist 5) misses.
    expect(hitColumnBorder(g, 0, 86, 10)).toEqual({ type: 'col', index: 0 });
    expect(hitColumnBorder(g, 0, 85, 10)).toBeNull();
  });

  it('respects scrollLeft when locating borders', () => {
    const g = geom();
    // Scrolled 50px: col1 right border (orig 140) now renders at 90.
    expect(hitColumnBorder(g, 50, 89, 10)).toEqual({ type: 'col', index: 1 });
  });

  it('returns null for an empty column axis', () => {
    const g = geom({ colSizes: new SizeManager({ count: 0, defaultSize: 50 }) });
    expect(hitColumnBorder(g, 0, 89, 10)).toBeNull();
  });

  it('does not report a border beyond the last column', () => {
    const g = geom({ colSizes: new SizeManager({ count: 2, defaultSize: 50 }) });
    // Pointer at the far right past col1; columnAt clamps to col1, whose
    // right border (140) is the only candidate within tolerance.
    expect(hitColumnBorder(g, 0, 138, 10)).toEqual({ type: 'col', index: 1 });
  });
});

describe('hitRowBorder', () => {
  it('returns the row whose bottom border is near the pointer', () => {
    const g = geom();
    // y=39 is 1px above row0 bottom edge (40), within the gutter (x<40).
    expect(hitRowBorder(g, 0, 10, 39)).toEqual({ type: 'row', index: 0 });
  });

  it('detects the upper-neighbour border when the pointer is in the next row', () => {
    const g = geom();
    expect(hitRowBorder(g, 0, 10, 41)).toEqual({ type: 'row', index: 0 });
  });

  it('returns null in the body of a row', () => {
    const g = geom();
    // y=30 is mid row0, far from border 40.
    expect(hitRowBorder(g, 0, 10, 30)).toBeNull();
  });

  it('returns null right of the row header', () => {
    const g = geom();
    expect(hitRowBorder(g, 0, 50, 39)).toBeNull();
  });

  it('returns null above the column header', () => {
    const g = geom();
    expect(hitRowBorder(g, 0, 10, 15)).toBeNull();
  });

  it('honours the tolerance boundary', () => {
    const g = geom();
    // Border at 40; default tolerance 4: y=36 hits, y=35 misses.
    expect(hitRowBorder(g, 0, 10, 36)).toEqual({ type: 'row', index: 0 });
    expect(hitRowBorder(g, 0, 10, 35)).toBeNull();
  });

  it('returns null for an empty row axis', () => {
    const g = geom({ rowSizes: new SizeManager({ count: 0, defaultSize: 20 }) });
    expect(hitRowBorder(g, 0, 10, 39)).toBeNull();
  });
});

describe('hitResizeHandle', () => {
  it('delegates to the column border test first', () => {
    const g = geom();
    expect(hitResizeHandle(g, 0, 0, 89, 10)).toEqual({ type: 'col', index: 0 });
  });

  it('falls back to the row border test', () => {
    const g = geom();
    expect(hitResizeHandle(g, 0, 0, 10, 39)).toEqual({ type: 'row', index: 0 });
  });

  it('returns null when neither border is hit', () => {
    const g = geom();
    // Mid-body cell, far from any header border.
    expect(hitResizeHandle(g, 0, 0, 200, 200)).toBeNull();
  });

  it('uses the supplied tolerance', () => {
    const g = geom();
    // Border at 90; with tolerance 1, x=88 (dist 2) misses.
    expect(hitResizeHandle(g, 0, 0, 88, 10, 1)).toBeNull();
    expect(hitResizeHandle(g, 0, 0, 89, 10, 1)).toEqual({ type: 'col', index: 0 });
  });
});
