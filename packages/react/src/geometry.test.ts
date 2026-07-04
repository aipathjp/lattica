import { describe, it, expect } from 'vitest';
import { SizeManager } from '@ai-path/tb-core';
import {
  columnX,
  rowY,
  cellRect,
  columnAt,
  rowAt,
  hitTest,
  layoutSignature,
  maxScroll,
  rowStripRect,
  summaryBandHeight,
  visibleRowStrips,
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

describe('summaryBandHeight', () => {
  it('is rows x row height when both are set', () => {
    expect(summaryBandHeight(geom({ summaryRows: 2, summaryRowHeight: 24 }))).toBe(48);
  });
  it('defaults missing fields to zero', () => {
    expect(summaryBandHeight(geom())).toBe(0);
    expect(summaryBandHeight(geom({ summaryRows: 3 }))).toBe(0);
    expect(summaryBandHeight(geom({ summaryRowHeight: 24 }))).toBe(0);
  });
});

describe('maxScroll with a summary band', () => {
  it('reserves the band height so the last rows stay reachable above it', () => {
    const g = geom({ summaryRows: 2, summaryRowHeight: 20 });
    // body height 120-20-40=60 -> maxTop 2000-60=1940 (vs 1900 without band)
    expect(maxScroll(g, 240, 120).maxTop).toBe(1940);
  });
});

describe('rowStripRect', () => {
  it('spans the body from the gutter to the data edge, following scroll', () => {
    const g = geom({ colSizes: new SizeManager({ count: 3, defaultSize: 50 }) });
    // right edge = min(clientWidth 400, 40 + 150) = 190 -> width 150
    expect(rowStripRect(g, 0, 0, 0, 400)).toEqual({ x: 40, y: 20, width: 150, height: 20 });
    // scrolled vertically: y follows rowY
    expect(rowStripRect(g, 0, 30, 2, 400)).toEqual({ x: 40, y: 20 + 40 - 30, width: 150, height: 20 });
    // horizontal scroll shrinks the visible data width
    expect(rowStripRect(g, 60, 0, 0, 400).width).toBe(90);
  });

  it('clips to the client width and clamps to zero when nothing fits', () => {
    const g = geom(); // total col width 2500
    expect(rowStripRect(g, 0, 0, 0, 240).width).toBe(200);
    // client narrower than the row-number gutter -> empty strip
    expect(rowStripRect(g, 0, 0, 0, 30).width).toBe(0);
  });

  it('uses per-row height overrides', () => {
    const rows = new SizeManager({ count: 10, defaultSize: 20 });
    rows.setSize(4, 44);
    const g = geom({ rowSizes: rows });
    expect(rowStripRect(g, 0, 0, 4, 400).height).toBe(44);
  });
});

describe('visibleRowStrips', () => {
  it('lists exactly the rows intersecting the body, top-down', () => {
    const g = geom(); // header 20, rows 20px
    // clientHeight 100 -> body [20,100) -> rows 0..3 fully, none beyond
    expect(visibleRowStrips(g, 0, 100)).toEqual([
      { row: 0, top: 20, height: 20 },
      { row: 1, top: 40, height: 20 },
      { row: 2, top: 60, height: 20 },
      { row: 3, top: 80, height: 20 },
    ]);
  });

  it('starts at the first row under the scroll offset, including partial rows', () => {
    const g = geom();
    const strips = visibleRowStrips(g, 30, 100);
    // scroll 30 -> row 1 (offset 20..40) is cut at the top; last visible is row 5 (top 90 < 100)
    expect(strips[0]).toEqual({ row: 1, top: 20 + 20 - 30, height: 20 });
    expect(strips.at(-1)).toEqual({ row: 5, top: 20 + 100 - 30, height: 20 });
  });

  it('negative scroll offsets behave like zero', () => {
    const g = geom();
    expect(visibleRowStrips(g, -50, 60)).toEqual(visibleRowStrips(g, 0, 60));
  });

  it('stops above the pinned summary band', () => {
    const g = geom({ summaryRows: 1, summaryRowHeight: 20 });
    // bottom limit 100-20=80 -> last row is row 2 (top 60)
    expect(visibleRowStrips(g, 0, 100).at(-1)).toEqual({ row: 2, top: 60, height: 20 });
  });

  it('returns every remaining row when content ends above the viewport bottom', () => {
    const g = geom({ rowSizes: new SizeManager({ count: 2, defaultSize: 20 }) });
    expect(visibleRowStrips(g, 0, 500)).toHaveLength(2);
  });

  it('pins frozen rows first, then the scrolled window below them', () => {
    const g = geom({ frozenRows: 2 });
    const strips = visibleRowStrips(g, 100, 120);
    // frozen rows 0-1 at their pinned offsets
    expect(strips[0]).toEqual({ row: 0, top: 20, height: 20 });
    expect(strips[1]).toEqual({ row: 1, top: 40, height: 20 });
    // scrolled region starts at offset frozenSize(40)+scroll(100)=140 -> row 7
    expect(strips[2]).toEqual({ row: 7, top: 20 + 140 - 100, height: 20 });
  });

  it('drops frozen rows below the bottom limit and handles all-frozen axes', () => {
    // clientHeight 30 -> bottom 30; frozen row 1 tops at 40 -> excluded
    expect(visibleRowStrips(geom({ frozenRows: 2 }), 0, 30)).toEqual([
      { row: 0, top: 20, height: 20 },
    ]);
    // more frozen rows than rows: the scrolled window is empty
    const g = geom({ rowSizes: new SizeManager({ count: 2, defaultSize: 20 }), frozenRows: 5 });
    expect(visibleRowStrips(g, 0, 500)).toHaveLength(2);
  });

  it('returns nothing for an empty grid', () => {
    const g = geom({ rowSizes: new SizeManager({ count: 0, defaultSize: 20 }) });
    expect(visibleRowStrips(g, 0, 200)).toEqual([]);
  });
});

describe('layoutSignature', () => {
  it('is stable for identical layouts', () => {
    expect(layoutSignature(geom(), 5, 10, 400, 200)).toBe(layoutSignature(geom(), 5, 10, 400, 200));
  });

  it('changes with scroll, client size, and band metrics', () => {
    const base = layoutSignature(geom(), 0, 0, 400, 200);
    expect(layoutSignature(geom(), 10, 0, 400, 200)).not.toBe(base);
    expect(layoutSignature(geom(), 0, 10, 400, 200)).not.toBe(base);
    expect(layoutSignature(geom(), 0, 0, 500, 200)).not.toBe(base);
    expect(layoutSignature(geom(), 0, 0, 400, 300)).not.toBe(base);
    expect(layoutSignature(geom({ colHeaderHeight: 40 }), 0, 0, 400, 200)).not.toBe(base);
    expect(layoutSignature(geom({ summaryRows: 1, summaryRowHeight: 20 }), 0, 0, 400, 200)).not.toBe(base);
  });

  it('distinguishes equal-total size redistributions and is insertion-order independent', () => {
    const a = new SizeManager({ count: 5, defaultSize: 50 });
    a.setSize(1, 70);
    a.setSize(3, 30); // total unchanged: +20 -20
    const redistributed = layoutSignature(geom({ colSizes: a }), 0, 0, 400, 200);
    expect(redistributed).not.toBe(layoutSignature(geom({ colSizes: new SizeManager({ count: 5, defaultSize: 50 }) }), 0, 0, 400, 200));
    // Same overrides applied in the opposite order fingerprint identically.
    const b = new SizeManager({ count: 5, defaultSize: 50 });
    b.setSize(3, 30);
    b.setSize(1, 70);
    expect(layoutSignature(geom({ colSizes: b }), 0, 0, 400, 200)).toBe(redistributed);
  });

  it('changes when the row count changes', () => {
    const shrunk = new SizeManager({ count: 99, defaultSize: 20 });
    expect(layoutSignature(geom({ rowSizes: shrunk }), 0, 0, 400, 200)).not.toBe(
      layoutSignature(geom(), 0, 0, 400, 200),
    );
  });
});
