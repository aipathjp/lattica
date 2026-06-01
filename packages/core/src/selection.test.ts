import { describe, it, expect, vi } from 'vitest';
import { SelectionModel } from './selection.js';
import { normalizeRange } from './range.js';

const make = (r = 10, c = 10) => new SelectionModel({ rowCount: r, colCount: c });

describe('initial state', () => {
  it('starts at the origin', () => {
    const s = make().getState();
    expect(s.active).toEqual({ row: 0, col: 0 });
    expect(s.ranges).toHaveLength(1);
  });
  it('clamps negative dimensions to zero', () => {
    const s = new SelectionModel({ rowCount: -5, colCount: -5 });
    s.setActive({ row: 3, col: 3 });
    expect(s.getState().active).toEqual({ row: 0, col: 0 });
  });
});

describe('setActive', () => {
  it('moves and collapses, clamping to bounds', () => {
    const s = make(5, 5);
    s.setActive({ row: 100, col: 100 });
    expect(s.getState().active).toEqual({ row: 4, col: 4 });
    s.setActive({ row: -3, col: -3 });
    expect(s.getState().active).toEqual({ row: 0, col: 0 });
  });
  it('emits to subscribers', () => {
    const s = make();
    const listener = vi.fn();
    const off = s.subscribe(listener);
    s.setActive({ row: 1, col: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    s.setActive({ row: 2, col: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('extendTo / move / extend', () => {
  it('extends from anchor', () => {
    const s = make();
    s.setActive({ row: 2, col: 2 });
    s.extendTo({ row: 4, col: 5 });
    const st = s.getState();
    expect(st.active).toEqual({ row: 4, col: 5 });
    expect(normalizeRange(st.ranges[0]!)).toEqual({ top: 2, left: 2, bottom: 4, right: 5 });
  });
  it('moves by delta', () => {
    const s = make();
    s.setActive({ row: 1, col: 1 });
    s.move(2, 3);
    expect(s.getState().active).toEqual({ row: 3, col: 4 });
  });
  it('extends by delta', () => {
    const s = make();
    s.setActive({ row: 1, col: 1 });
    s.extend(2, 2);
    expect(normalizeRange(s.getState().ranges[0]!)).toEqual({ top: 1, left: 1, bottom: 3, right: 3 });
  });
});

describe('multi-range', () => {
  it('adds independent ranges', () => {
    const s = make();
    s.setActive({ row: 0, col: 0 });
    s.addRange({ start: { row: 5, col: 5 }, end: { row: 6, col: 6 } });
    expect(s.getState().ranges).toHaveLength(2);
    expect(s.isSelected({ row: 6, col: 6 })).toBe(true);
    expect(s.isSelected({ row: 0, col: 0 })).toBe(true);
    expect(s.isSelected({ row: 3, col: 3 })).toBe(false);
  });
});

describe('row/column/all selection', () => {
  it('selects a full row', () => {
    const s = make(10, 8);
    s.selectRow(3);
    expect(normalizeRange(s.getState().ranges[0]!)).toEqual({ top: 3, left: 0, bottom: 3, right: 7 });
  });
  it('selects a full column', () => {
    const s = make(10, 8);
    s.selectColumn(2);
    expect(normalizeRange(s.getState().ranges[0]!)).toEqual({ top: 0, left: 2, bottom: 9, right: 2 });
  });
  it('clamps row/column indices', () => {
    const s = make(10, 8);
    s.selectRow(999);
    expect(s.getState().active.row).toBe(9);
    s.selectColumn(-5);
    expect(s.getState().active.col).toBe(0);
  });
  it('selects all', () => {
    const s = make(10, 8);
    s.selectAll();
    expect(normalizeRange(s.getState().ranges[0]!)).toEqual({ top: 0, left: 0, bottom: 9, right: 7 });
  });
});

describe('isActive & bounds', () => {
  it('reports the active cell', () => {
    const s = make();
    s.setActive({ row: 2, col: 3 });
    expect(s.isActive({ row: 2, col: 3 })).toBe(true);
    expect(s.isActive({ row: 0, col: 0 })).toBe(false);
  });
  it('computes selection bounds across ranges', () => {
    const s = make();
    s.setActive({ row: 1, col: 1 });
    s.addRange({ start: { row: 5, col: 6 }, end: { row: 7, col: 8 } });
    expect(normalizeRange(s.getSelectionBounds())).toEqual({ top: 1, left: 1, bottom: 7, right: 8 });
  });
});

describe('setDimensions', () => {
  it('re-clamps the active cell when the grid shrinks', () => {
    const s = make(10, 10);
    s.setActive({ row: 9, col: 9 });
    s.setDimensions(5, 5);
    expect(s.getState().active).toEqual({ row: 4, col: 4 });
  });
});
