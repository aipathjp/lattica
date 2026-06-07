import { describe, it, expect, vi } from 'vitest';
import { DetailModel } from './detail.js';

describe('DetailModel', () => {
  it('toggles expansion and reports state', () => {
    const m = new DetailModel();
    expect(m.isExpanded(2)).toBe(false);
    m.toggle(2);
    expect(m.isExpanded(2)).toBe(true);
    m.toggle(2);
    expect(m.isExpanded(2)).toBe(false);
  });

  it('expand/collapse are idempotent and only notify on change', () => {
    const m = new DetailModel();
    const fn = vi.fn();
    m.subscribe(fn);
    m.expand(1);
    m.expand(1); // no-op
    expect(fn).toHaveBeenCalledTimes(1);
    m.collapse(1);
    m.collapse(1); // no-op
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('lists expanded rows ascending and clears them', () => {
    const m = new DetailModel();
    m.expand(5);
    m.expand(1);
    m.expand(3);
    expect(m.expandedRows()).toEqual([1, 3, 5]);
    const fn = vi.fn();
    m.subscribe(fn);
    m.clear();
    expect(m.expandedRows()).toEqual([]);
    expect(fn).toHaveBeenCalledTimes(1);
    m.clear(); // no-op when already empty
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops notifications', () => {
    const m = new DetailModel();
    const fn = vi.fn();
    const off = m.subscribe(fn);
    off();
    m.expand(0);
    expect(fn).not.toHaveBeenCalled();
  });
});
