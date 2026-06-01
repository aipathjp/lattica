import { describe, it, expect } from 'vitest';
import { SizeManager, SelectionModel } from '@lattica/core';
import { buildScene, visibleIndices } from './scene.js';
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

describe('visibleIndices', () => {
  it('returns the window plus frozen leading indices', () => {
    const sizes = new SizeManager({ count: 100, defaultSize: 20 });
    const idx = visibleIndices(sizes, 0, 100, 0, 0);
    expect(idx[0]).toBe(0);
    expect(idx).toContain(4);
  });
  it('always includes frozen indices', () => {
    const sizes = new SizeManager({ count: 100, defaultSize: 20 });
    const idx = visibleIndices(sizes, 500, 100, 2, 0);
    expect(idx.slice(0, 2)).toEqual([0, 1]);
  });
});

describe('buildScene', () => {
  it('produces cells for the visible window', () => {
    const sel = new SelectionModel({ rowCount: 100, colCount: 100 });
    const scene = buildScene({
      geom: geom(),
      scrollLeft: 0,
      scrollTop: 0,
      clientWidth: 240,
      clientHeight: 120,
      selection: sel,
      getDisplay: (r, c) => `${r},${c}`,
    });
    expect(scene.cells.length).toBeGreaterThan(0);
    expect(scene.cells[0]!.text).toBe('0,0');
    expect(scene.visibleRows[0]).toBe(0);
    expect(scene.visibleCols[0]).toBe(0);
  });

  it('marks the active cell and selection', () => {
    const sel = new SelectionModel({ rowCount: 100, colCount: 100 });
    sel.setActive({ row: 1, col: 1 });
    sel.extendTo({ row: 2, col: 2 });
    const scene = buildScene({
      geom: geom(),
      scrollLeft: 0,
      scrollTop: 0,
      clientWidth: 400,
      clientHeight: 200,
      selection: sel,
      getDisplay: () => '',
    });
    const active = scene.cells.find((c) => c.active);
    expect(active).toMatchObject({ row: 2, col: 2 });
    expect(scene.activeRect).not.toBeNull();
    expect(scene.cells.some((c) => c.selected && c.row === 1 && c.col === 1)).toBe(true);
  });

  it('has a null active rect when the active cell is scrolled out of view', () => {
    const sel = new SelectionModel({ rowCount: 100, colCount: 100 });
    sel.setActive({ row: 0, col: 0 });
    const scene = buildScene({
      geom: geom(),
      scrollLeft: 0,
      scrollTop: 1000, // active row 0 not visible
      clientWidth: 240,
      clientHeight: 120,
      selection: sel,
      getDisplay: () => '',
    });
    expect(scene.activeRect).toBeNull();
  });
});
