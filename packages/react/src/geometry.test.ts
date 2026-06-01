import { describe, it, expect } from 'vitest';
import { SizeManager } from '@lattica/core';
import {
  columnX,
  rowY,
  cellRect,
  columnAt,
  rowAt,
  hitTest,
  maxScroll,
  type GridGeometry,
} from './geometry.js';

const geom = (overrides: Partial<GridGeometry> = {}): GridGeometry => ({
  rowSizes: new SizeManager({ count: 100, defaultSize: 20 }),
  colSizes: new SizeManager({ count: 50, defaultSize: 50 }),
  frozenRows: 0,
  frozenCols: 0,
  rowHeaderWidth: 40,
  colHeaderHeight: 20,
  ...overrides,
});

describe('columnX / rowY', () => {
  it('positions body columns after the row header, offset by scroll', () => {
    const g = geom();
    expect(columnX(g, 0, 0)).toBe(40);
    expect(columnX(g, 0, 2)).toBe(40 + 100);
    expect(columnX(g, 30, 2)).toBe(40 + 100 - 30);
  });

  it('pins frozen columns regardless of scroll', () => {
    const g = geom({ frozenCols: 1 });
    expect(columnX(g, 999, 0)).toBe(40);
  });

  it('positions rows below the column header', () => {
    const g = geom();
    expect(rowY(g, 0, 0)).toBe(20);
    expect(rowY(g, 40, 3)).toBe(20 + 60 - 40);
  });

  it('pins frozen rows', () => {
    const g = geom({ frozenRows: 2 });
    expect(rowY(g, 500, 1)).toBe(20 + 20);
  });
});

describe('cellRect', () => {
  it('returns position and size', () => {
    const g = geom();
    expect(cellRect(g, 0, 0, 1, 1)).toEqual({ x: 90, y: 40, width: 50, height: 20 });
  });
});

describe('columnAt / rowAt', () => {
  it('maps body x/y back to indices', () => {
    const g = geom();
    expect(columnAt(g, 0, 40)).toBe(0);
    expect(columnAt(g, 0, 95)).toBe(1);
    expect(columnAt(g, 100, 45)).toBe(2); // x 45 -> xInGrid 5 + scroll 100 = 105 -> col 2
    expect(rowAt(g, 0, 20)).toBe(0);
    expect(rowAt(g, 0, 41)).toBe(1);
  });

  it('routes frozen-region coordinates without applying scroll', () => {
    const g = geom({ frozenCols: 2, frozenRows: 2 });
    // frozen width = 100; x within [40,140) is frozen.
    expect(columnAt(g, 500, 90)).toBe(1); // xInGrid 50 -> col 1, no scroll
    expect(rowAt(g, 500, 30)).toBe(0);
  });
});

describe('hitTest', () => {
  const g = geom();
  it('detects the corner', () => {
    expect(hitTest(g, 0, 0, 10, 10)).toEqual({ region: 'corner', row: -1, col: -1 });
  });
  it('detects the column header', () => {
    expect(hitTest(g, 0, 0, 90, 10)).toMatchObject({ region: 'colHeader', col: 1 });
  });
  it('detects the row header', () => {
    expect(hitTest(g, 0, 0, 10, 41)).toMatchObject({ region: 'rowHeader', row: 1 });
  });
  it('detects a body cell', () => {
    expect(hitTest(g, 0, 0, 90, 41)).toMatchObject({ region: 'cell', row: 1, col: 1 });
  });
});

describe('maxScroll', () => {
  it('computes the maximum scroll offsets', () => {
    const g = geom(); // total col 50*50=2500, row 100*20=2000
    const { maxLeft, maxTop } = maxScroll(g, 240, 120);
    // body width 200 -> maxLeft 2500-200=2300; body height 100 -> 2000-100=1900
    expect(maxLeft).toBe(2300);
    expect(maxTop).toBe(1900);
  });
  it('clamps to zero when content fits', () => {
    const g = geom({ colSizes: new SizeManager({ count: 1, defaultSize: 10 }) });
    expect(maxScroll(g, 1000, 1000).maxLeft).toBe(0);
  });
});
