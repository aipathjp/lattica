import { describe, it, expect } from 'vitest';
import { SizeManager, computeHeaderLayout, type ColumnNode } from '@ai-path/tb-core';
import { columnHeaderCells, computeHeaderRowHeights, rowHeaderCells } from './headers.js';
import type { GridGeometry } from './geometry.js';

const geom = (overrides: Partial<GridGeometry> = {}): GridGeometry => ({
  rowSizes: new SizeManager({ count: 100, defaultSize: 20 }),
  colSizes: new SizeManager({ count: 100, defaultSize: 50 }),
  frozenRows: 0,
  frozenCols: 0,
  rowHeaderWidth: 40,
  colHeaderHeight: 24,
  ...overrides,
});

describe('columnHeaderCells (default letters)', () => {
  it('positions one letter per visible column', () => {
    const cells = columnHeaderCells(geom(), 0, [0, 1, 2], null);
    expect(cells.map((c) => c.label)).toEqual(['A', 'B', 'C']);
    expect(cells[0]).toMatchObject({ x: 40, y: 0, width: 50, height: 24, isGroup: false, col: 0 });
    expect(cells[2]!.col).toBe(2);
  });

  it('returns nothing when no columns are visible', () => {
    expect(columnHeaderCells(geom(), 0, [], null)).toEqual([]);
  });

  it('treats a zero-depth layout like the default', () => {
    const empty = computeHeaderLayout([]);
    expect(columnHeaderCells(geom(), 0, [0], empty).map((c) => c.label)).toEqual(['A']);
  });
});

describe('columnHeaderCells (multi-level)', () => {
  const cols: ColumnNode[] = [
    { headerName: 'A', field: 'a' },
    {
      headerName: 'Group',
      children: [{ headerName: 'B' }, { headerName: 'C' }],
    },
  ];

  it('lays out group cells spanning their leaves across bands', () => {
    const layout = computeHeaderLayout(cols);
    const cells = columnHeaderCells(geom(), 0, [0, 1, 2], layout);
    const group = cells.find((c) => c.label === 'Group')!;
    expect(group.isGroup).toBe(true);
    // Group spans leaves 1..2 -> x from col1 (90) to end of col2 (190), width 100.
    expect(group.x).toBe(90);
    expect(group.width).toBe(100);
    // Two header bands of height 12 each.
    expect(group.height).toBe(12);
    const leafB = cells.find((c) => c.label === 'B')!;
    expect(leafB.y).toBe(12);
    // Leaf headers carry their column index; group headers do not.
    expect(leafB.col).toBe(1);
    expect(group.col).toBeUndefined();
  });

  it('omits header cells outside the visible column range', () => {
    const layout = computeHeaderLayout(cols);
    // Only column 0 visible -> the Group (leaves 1..2) is excluded.
    const cells = columnHeaderCells(geom(), 0, [0], layout);
    expect(cells.some((c) => c.label === 'Group')).toBe(false);
    expect(cells.some((c) => c.label === 'A')).toBe(true);
  });

  it('drops hidden leaves and shrinks their group via leafToVisual', () => {
    const layout = computeHeaderLayout(cols);
    // Leaf 1 (B) hidden: physical 0 -> visual 0, 1 -> hidden (-1), 2 -> visual 1.
    const leafToVisual = (leaf: number) => (leaf === 1 ? -1 : leaf === 2 ? 1 : leaf);
    const cells = columnHeaderCells(geom(), 0, [0, 1], layout, leafToVisual);
    expect(cells.some((c) => c.label === 'B')).toBe(false);
    const group = cells.find((c) => c.label === 'Group')!;
    // Group now covers only visual col 1 (x 90, one column wide).
    expect(group.x).toBe(90);
    expect(group.width).toBe(50);
    const leafC = cells.find((c) => c.label === 'C')!;
    expect(leafC.col).toBe(1);
  });

  it('spans a group over moved leaves whose visual order is reversed', () => {
    const layout = computeHeaderLayout(cols);
    // Physical leaves 1,2 render at swapped visual positions 2,1.
    const leafToVisual = (leaf: number) => (leaf === 1 ? 2 : leaf === 2 ? 1 : 0);
    const cells = columnHeaderCells(geom(), 0, [0, 1, 2], layout, leafToVisual);
    const group = cells.find((c) => c.label === 'Group')!;
    expect(group.x).toBe(90);
    expect(group.width).toBe(100);
    expect(cells.find((c) => c.label === 'B')!.col).toBe(2);
  });

  it('omits a group whose leaves are all hidden', () => {
    const layout = computeHeaderLayout(cols);
    const leafToVisual = (leaf: number) => (leaf === 0 ? 0 : -1);
    const cells = columnHeaderCells(geom(), 0, [0], layout, leafToVisual);
    expect(cells.map((c) => c.label)).toEqual(['A']);
  });

  it('exposes collapse metadata', () => {
    const collapsible: ColumnNode[] = [
      { id: 'g', headerName: 'G', collapsible: true, children: [{ headerName: 'X' }] },
    ];
    const layout = computeHeaderLayout(collapsible);
    const cells = columnHeaderCells(geom(), 0, [0], layout);
    const g = cells.find((c) => c.id === 'g')!;
    expect(g.collapsible).toBe(true);
    expect(g.collapsed).toBe(false);
  });
});

describe('computeHeaderRowHeights', () => {
  const opts = { baseHeight: 24, lineHeight: 16, paddingY: 3 };

  it('returns the base height when there is no layout', () => {
    expect(computeHeaderRowHeights(null, opts)).toEqual({ rows: [24], total: 24 });
  });

  it('returns the base height for a zero-depth layout', () => {
    expect(computeHeaderRowHeights(computeHeaderLayout([]), opts)).toEqual({ rows: [24], total: 24 });
  });

  it('keeps the legacy uniform band for single-line layouts', () => {
    const layout = computeHeaderLayout([
      { headerName: 'A' },
      { headerName: 'G', children: [{ headerName: 'B' }] },
    ]);
    expect(computeHeaderRowHeights(layout, opts)).toEqual({ rows: [12, 12], total: 24 });
  });

  it('expands rows containing multi-line labels', () => {
    const layout = computeHeaderLayout([
      { headerName: 'G', children: [{ headerName: 'a\nb' }] },
    ]);
    // depth 2, band 12; row 1 needs 2 lines -> max(12, 2*16 + 2*3) = 38.
    expect(computeHeaderRowHeights(layout, opts)).toEqual({ rows: [12, 38], total: 50 });
  });

  it('never shrinks a multi-line row below its band', () => {
    const layout = computeHeaderLayout([{ headerName: 'x\ny' }]);
    const tall = computeHeaderRowHeights(layout, { baseHeight: 100, lineHeight: 16, paddingY: 3 });
    expect(tall).toEqual({ rows: [100], total: 100 });
  });
});

describe('columnHeaderCells (per-row heights)', () => {
  const cols: ColumnNode[] = [
    { headerName: 'A', field: 'a' },
    { headerName: 'Group', children: [{ headerName: 'B\nb' }, { headerName: 'C' }] },
  ];

  it('positions cells with uneven row heights', () => {
    const layout = computeHeaderLayout(cols);
    const cells = columnHeaderCells(geom(), 0, [0, 1, 2], layout, undefined, [10, 30]);
    const group = cells.find((c) => c.label === 'Group')!;
    expect(group.y).toBe(0);
    expect(group.height).toBe(10);
    const leafB = cells.find((c) => c.label === 'B\nb')!;
    expect(leafB.y).toBe(10);
    expect(leafB.height).toBe(30);
    // Top-level leaf spans both rows -> full 40px.
    const leafA = cells.find((c) => c.label === 'A')!;
    expect(leafA.y).toBe(0);
    expect(leafA.height).toBe(40);
  });

  it('falls back to the uniform band for rows missing from rowHeights', () => {
    const layout = computeHeaderLayout(cols);
    // Only row 0 supplied; row 1 falls back to geom.colHeaderHeight / depth = 12.
    const cells = columnHeaderCells(geom(), 0, [0, 1, 2], layout, undefined, [10]);
    expect(cells.find((c) => c.label === 'C')!.height).toBe(12);
    expect(cells.find((c) => c.label === 'A')!.height).toBe(22);
  });
});

describe('rowHeaderCells', () => {
  it('positions 1-based row numbers', () => {
    const cells = rowHeaderCells(geom(), 0, [0, 1, 2]);
    expect(cells.map((c) => c.label)).toEqual(['1', '2', '3']);
    expect(cells[1]).toMatchObject({ row: 1, y: 44, height: 20 });
  });
});
