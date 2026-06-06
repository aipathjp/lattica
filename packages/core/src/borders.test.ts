import { describe, it, expect, vi } from 'vitest';
import { BorderModel } from './borders.js';

describe('BorderModel', () => {
  it('returns {} when a cell has no borders', () => {
    const m = new BorderModel();
    expect(m.get(0, 0)).toEqual({});
  });

  it('sets and gets a single side', () => {
    const m = new BorderModel();
    m.set(1, 1, 'top', { width: 2, color: '#000', style: 'solid' });
    expect(m.get(1, 1)).toEqual({ top: { width: 2, color: '#000', style: 'solid' } });
  });

  it('sets multiple sides on the same cell', () => {
    const m = new BorderModel();
    m.set(0, 0, 'top', { width: 1 });
    m.set(0, 0, 'bottom', { width: 3 });
    expect(m.get(0, 0)).toEqual({ top: { width: 1 }, bottom: { width: 3 } });
  });

  it('overwrites a side', () => {
    const m = new BorderModel();
    m.set(0, 0, 'left', { style: 'solid' });
    m.set(0, 0, 'left', { style: 'dashed' });
    expect(m.get(0, 0)).toEqual({ left: { style: 'dashed' } });
  });

  it('stores a copy of the style (no aliasing on set)', () => {
    const m = new BorderModel();
    const style = { width: 1 };
    m.set(0, 0, 'top', style);
    style.width = 99;
    expect(m.get(0, 0)).toEqual({ top: { width: 1 } });
  });

  it('returns copies of styles (no aliasing on get)', () => {
    const m = new BorderModel();
    m.set(0, 0, 'top', { width: 1 });
    const a = m.get(0, 0);
    a.top!.width = 99;
    expect(m.get(0, 0)).toEqual({ top: { width: 1 } });
  });

  it('clears a single side, keeping others', () => {
    const m = new BorderModel();
    m.set(0, 0, 'top', { width: 1 });
    m.set(0, 0, 'bottom', { width: 2 });
    m.set(0, 0, 'top', null);
    expect(m.get(0, 0)).toEqual({ bottom: { width: 2 } });
  });

  it('removes the cell entry when clearing the last side', () => {
    const m = new BorderModel();
    m.set(0, 0, 'right', { width: 1 });
    m.set(0, 0, 'right', null);
    expect(m.get(0, 0)).toEqual({});
  });

  it('clearing a side on a cell with no borders is a no-op', () => {
    const m = new BorderModel();
    const fn = vi.fn();
    m.subscribe(fn);
    m.set(0, 0, 'top', null);
    expect(m.get(0, 0)).toEqual({});
    expect(fn).not.toHaveBeenCalled();
  });

  it('clearing an absent side on an existing cell is a no-op', () => {
    const m = new BorderModel();
    m.set(0, 0, 'top', { width: 1 });
    const fn = vi.fn();
    m.subscribe(fn);
    m.set(0, 0, 'bottom', null);
    expect(m.get(0, 0)).toEqual({ top: { width: 1 } });
    expect(fn).not.toHaveBeenCalled();
  });

  it('clearCell removes all sides', () => {
    const m = new BorderModel();
    m.set(0, 0, 'top', { width: 1 });
    m.set(0, 0, 'left', { width: 2 });
    m.clearCell(0, 0);
    expect(m.get(0, 0)).toEqual({});
  });

  it('clearCell is a no-op when the cell has no borders', () => {
    const m = new BorderModel();
    const fn = vi.fn();
    m.subscribe(fn);
    m.clearCell(5, 5);
    expect(fn).not.toHaveBeenCalled();
  });

  it('clears all cells', () => {
    const m = new BorderModel();
    m.set(0, 0, 'top', { width: 1 });
    m.set(1, 1, 'bottom', { width: 2 });
    m.clear();
    expect(m.get(0, 0)).toEqual({});
    expect(m.get(1, 1)).toEqual({});
  });

  it('clear() is a no-op when already empty', () => {
    const m = new BorderModel();
    const fn = vi.fn();
    m.subscribe(fn);
    m.clear();
    expect(fn).not.toHaveBeenCalled();
  });

  describe('subscribe', () => {
    it('notifies on set (new cell)', () => {
      const m = new BorderModel();
      const fn = vi.fn();
      m.subscribe(fn);
      m.set(0, 0, 'top', { width: 1 });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('notifies on set (existing cell)', () => {
      const m = new BorderModel();
      m.set(0, 0, 'top', { width: 1 });
      const fn = vi.fn();
      m.subscribe(fn);
      m.set(0, 0, 'bottom', { width: 2 });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('notifies when clearing a side', () => {
      const m = new BorderModel();
      m.set(0, 0, 'top', { width: 1 });
      const fn = vi.fn();
      m.subscribe(fn);
      m.set(0, 0, 'top', null);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('notifies on clearCell when borders existed', () => {
      const m = new BorderModel();
      m.set(0, 0, 'top', { width: 1 });
      const fn = vi.fn();
      m.subscribe(fn);
      m.clearCell(0, 0);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('notifies on clear when non-empty', () => {
      const m = new BorderModel();
      m.set(0, 0, 'top', { width: 1 });
      const fn = vi.fn();
      m.subscribe(fn);
      m.clear();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('stops notifying after unsubscribe', () => {
      const m = new BorderModel();
      const fn = vi.fn();
      const off = m.subscribe(fn);
      off();
      m.set(0, 0, 'top', { width: 1 });
      expect(fn).not.toHaveBeenCalled();
    });
  });
});
