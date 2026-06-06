import { describe, it, expect, vi } from 'vitest';

import { NestedRowModel, type NestedRowNode } from './nested-rows.js';

/**
 * Build a sample tree:
 *
 *   0 (root)
 *   ├─ 1
 *   │  ├─ 2
 *   │  └─ 3 (leaf)
 *   └─ 4 (leaf)
 *   5 (root, leaf)
 *
 * Node 2 has a child 6 to exercise deep nesting.
 */
function sampleTree(): NestedRowNode[] {
  return [
    {
      row: 0,
      children: [
        {
          row: 1,
          children: [{ row: 2, children: [{ row: 6 }] }, { row: 3 }],
        },
        { row: 4 },
      ],
    },
    { row: 5 },
  ];
}

describe('NestedRowModel', () => {
  it('builds the tree and reports isParent', () => {
    const m = new NestedRowModel(sampleTree());
    expect(m.isParent(0)).toBe(true);
    expect(m.isParent(1)).toBe(true);
    expect(m.isParent(2)).toBe(true);
    expect(m.isParent(3)).toBe(false); // leaf
    expect(m.isParent(4)).toBe(false); // leaf
    expect(m.isParent(5)).toBe(false); // root leaf
    expect(m.isParent(99)).toBe(false); // unknown
  });

  it('reports getDepth with -1 for unknown rows', () => {
    const m = new NestedRowModel(sampleTree());
    expect(m.getDepth(0)).toBe(0);
    expect(m.getDepth(5)).toBe(0);
    expect(m.getDepth(1)).toBe(1);
    expect(m.getDepth(4)).toBe(1);
    expect(m.getDepth(2)).toBe(2);
    expect(m.getDepth(3)).toBe(2);
    expect(m.getDepth(6)).toBe(3);
    expect(m.getDepth(99)).toBe(-1);
  });

  it('starts fully expanded with nothing hidden', () => {
    const m = new NestedRowModel(sampleTree());
    expect(m.isCollapsed(0)).toBe(false);
    expect(m.hiddenRows()).toEqual([]);
  });

  it('collapsing a parent hides all descendants recursively but keeps the parent visible', () => {
    const m = new NestedRowModel(sampleTree());
    m.toggle(1);
    expect(m.isCollapsed(1)).toBe(true);
    // Descendants of 1: 2, 3, and 2's child 6. Parent 1 stays visible.
    expect(m.hiddenRows()).toEqual([2, 3, 6]);
  });

  it('collapsing a deep node hides only its subtree', () => {
    const m = new NestedRowModel(sampleTree());
    m.toggle(2);
    expect(m.hiddenRows()).toEqual([6]);
  });

  it('nested collapse hides each descendant once (deduped, sorted)', () => {
    const m = new NestedRowModel(sampleTree());
    m.setCollapsed(0, true);
    m.setCollapsed(1, true);
    m.setCollapsed(2, true);
    // 6 is a descendant of all three collapsed ancestors but appears once.
    expect(m.hiddenRows()).toEqual([1, 2, 3, 4, 6]);
  });

  it('toggle expands again, restoring visibility', () => {
    const m = new NestedRowModel(sampleTree());
    m.toggle(1);
    expect(m.hiddenRows()).toEqual([2, 3, 6]);
    m.toggle(1);
    expect(m.isCollapsed(1)).toBe(false);
    expect(m.hiddenRows()).toEqual([]);
  });

  it('setCollapsed explicitly collapses and expands', () => {
    const m = new NestedRowModel(sampleTree());
    m.setCollapsed(2, true);
    expect(m.isCollapsed(2)).toBe(true);
    expect(m.hiddenRows()).toEqual([6]);
    m.setCollapsed(2, false);
    expect(m.isCollapsed(2)).toBe(false);
    expect(m.hiddenRows()).toEqual([]);
  });

  it('toggle on a leaf is a no-op', () => {
    const m = new NestedRowModel(sampleTree());
    const listener = vi.fn();
    m.subscribe(listener);
    m.toggle(3); // leaf
    expect(m.isCollapsed(3)).toBe(false);
    expect(m.hiddenRows()).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('setCollapsed on a leaf is a no-op', () => {
    const m = new NestedRowModel(sampleTree());
    const listener = vi.fn();
    m.subscribe(listener);
    m.setCollapsed(3, true); // leaf
    expect(m.isCollapsed(3)).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('setTree replaces the tree and resets collapse state', () => {
    const m = new NestedRowModel(sampleTree());
    m.toggle(1);
    expect(m.hiddenRows()).toEqual([2, 3, 6]);

    m.setTree([{ row: 10, children: [{ row: 11 }] }]);
    // Old collapse state gone.
    expect(m.isCollapsed(1)).toBe(false);
    expect(m.hiddenRows()).toEqual([]);
    // Old rows no longer in the tree.
    expect(m.getDepth(1)).toBe(-1);
    // New tree usable.
    expect(m.isParent(10)).toBe(true);
    expect(m.getDepth(10)).toBe(0);
    expect(m.getDepth(11)).toBe(1);
    m.toggle(10);
    expect(m.hiddenRows()).toEqual([11]);
  });

  it('notifies subscribers on mutations and stops after unsubscribe', () => {
    const m = new NestedRowModel(sampleTree());
    const listener = vi.fn();
    const unsubscribe = m.subscribe(listener);

    m.toggle(1);
    expect(listener).toHaveBeenCalledTimes(1);
    m.setCollapsed(2, true);
    expect(listener).toHaveBeenCalledTimes(2);
    m.setTree(sampleTree());
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    m.toggle(1);
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
