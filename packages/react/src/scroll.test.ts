import { describe, it, expect } from 'vitest';
import { SizeManager } from '@lattica/core';
import { scrollToCell, clampScroll } from './scroll.js';
import type { GridGeometry } from './geometry.js';

const geom = (overrides: Partial<GridGeometry> = {}): GridGeometry => ({
  rowSizes: new SizeManager({ count: 100, defaultSize: 20 }),
  colSizes: new SizeManager({ count: 100, defaultSize: 50 }),
  frozenRows: 0,
  frozenCols: 0,
  rowHeaderWidth: 40,
  colHeaderHeight: 20,
  ...overrides,
});

describe('scrollToCell', () => {
  it('keeps an already-visible cell put', () => {
    const g = geom();
    expect(scrollToCell(g, { left: 0, top: 0 }, 440, 220, 2, 2)).toEqual({ left: 0, top: 0 });
  });

  it('scrolls right to reveal a cell past the right edge', () => {
    const g = geom();
    // body width = 440-40 = 400 (8 cols). col 10 offset=500, size 50 -> need left = 550-400 = 150
    const result = scrollToCell(g, { left: 0, top: 0 }, 440, 220, 0, 10);
    expect(result.left).toBe(150);
  });

  it('scrolls left to reveal a cell past the left edge', () => {
    const g = geom();
    const result = scrollToCell(g, { left: 300, top: 0 }, 440, 220, 0, 2);
    expect(result.left).toBe(100); // offset(2)=100 < 300 -> left=100
  });

  it('scrolls down to reveal a lower cell', () => {
    const g = geom();
    // body height 220-20=200 (10 rows). row 15 offset=300 size20 -> top = 320-200 = 120
    const result = scrollToCell(g, { left: 0, top: 0 }, 440, 220, 15, 0);
    expect(result.top).toBe(120);
  });

  it('never scrolls for frozen leading cells', () => {
    const g = geom({ frozenCols: 3, frozenRows: 3 });
    const result = scrollToCell(g, { left: 80, top: 40 }, 440, 220, 1, 1);
    expect(result).toEqual({ left: 80, top: 40 });
  });

  it('clamps to the max scroll', () => {
    const g = geom();
    const result = scrollToCell(g, { left: 0, top: 0 }, 440, 220, 99, 99);
    const maxLeft = 100 * 50 - 400;
    expect(result.left).toBe(maxLeft);
  });
});

describe('clampScroll', () => {
  it('clamps negatives to zero and excess to the max', () => {
    const g = geom();
    expect(clampScroll(g, { left: -50, top: -10 }, 440, 220)).toEqual({ left: 0, top: 0 });
    const huge = clampScroll(g, { left: 1e9, top: 1e9 }, 440, 220);
    expect(huge.left).toBe(100 * 50 - 400);
    expect(huge.top).toBe(100 * 20 - 200);
  });
});
