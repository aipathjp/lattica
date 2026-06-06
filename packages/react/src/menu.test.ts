import { describe, it, expect, vi } from 'vitest';
import { buildMenu, findItem, runItem } from './menu.js';
import type { MenuItem, MenuItemSpec } from './menu.js';

const sep: MenuItem = { id: 'sep', separator: true };

describe('buildMenu — falsy filtering', () => {
  it('drops false, null and undefined entries', () => {
    const spec: MenuItemSpec[] = [
      { id: 'a' },
      false,
      null,
      undefined,
      { id: 'b' },
    ];
    expect(buildMenu(spec).map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('returns an empty list when everything is falsy', () => {
    expect(buildMenu([false, null, undefined])).toEqual([]);
    expect(buildMenu([])).toEqual([]);
  });
});

describe('buildMenu — separator trimming and collapsing', () => {
  it('drops leading separators', () => {
    const out = buildMenu([{ ...sep }, { ...sep }, { id: 'a' }]);
    expect(out.map((i) => i.id)).toEqual(['a']);
  });

  it('drops a trailing separator', () => {
    const out = buildMenu([{ id: 'a' }, { ...sep }]);
    expect(out.map((i) => i.id)).toEqual(['a']);
  });

  it('collapses consecutive separators into one', () => {
    const out = buildMenu([
      { id: 'a' },
      { id: 's1', separator: true },
      { id: 's2', separator: true },
      { id: 's3', separator: true },
      { id: 'b' },
    ]);
    expect(out.map((i) => i.id)).toEqual(['a', 's1', 'b']);
    expect(out[1]?.separator).toBe(true);
  });

  it('keeps a single interior separator', () => {
    const out = buildMenu([{ id: 'a' }, { ...sep }, { id: 'b' }]);
    expect(out.map((i) => i.id)).toEqual(['a', 'sep', 'b']);
  });

  it('handles a list that is only separators', () => {
    expect(buildMenu([{ ...sep }, { ...sep }])).toEqual([]);
  });
});

describe('buildMenu — submenu recursion', () => {
  it('recurses into submenus, trimming nested separators', () => {
    const out = buildMenu([
      {
        id: 'parent',
        submenu: [
          { ...sep },
          { id: 'child-a' },
          { id: 's', separator: true },
          { id: 's2', separator: true },
          { id: 'child-b' },
          { ...sep },
        ],
      },
    ]);
    expect(out).toHaveLength(1);
    const submenu = out[0]?.submenu ?? [];
    expect(submenu.map((i) => i.id)).toEqual(['child-a', 's', 'child-b']);
  });

  it('leaves items without a submenu untouched (no clone)', () => {
    const leaf: MenuItem = { id: 'leaf', label: 'Leaf' };
    const out = buildMenu([leaf]);
    expect(out[0]).toBe(leaf);
  });

  it('clones items that have a submenu', () => {
    const parent: MenuItem = { id: 'p', submenu: [{ id: 'c' }] };
    const out = buildMenu([parent]);
    expect(out[0]).not.toBe(parent);
    expect(out[0]?.submenu?.[0]?.id).toBe('c');
  });
});

describe('findItem', () => {
  const menu: MenuItem[] = [
    { id: 'top' },
    {
      id: 'parent',
      submenu: [{ id: 'child' }, { id: 'nested-parent', submenu: [{ id: 'deep' }] }],
    },
  ];

  it('finds a top-level item', () => {
    expect(findItem(menu, 'top')?.id).toBe('top');
  });

  it('finds a nested item', () => {
    expect(findItem(menu, 'child')?.id).toBe('child');
    expect(findItem(menu, 'deep')?.id).toBe('deep');
  });

  it('returns null when not found', () => {
    expect(findItem(menu, 'missing')).toBeNull();
    expect(findItem([], 'anything')).toBeNull();
  });
});

describe('runItem', () => {
  it('calls the action and returns true for an enabled item', () => {
    const action = vi.fn();
    const menu: MenuItem[] = [{ id: 'a', action }];
    expect(runItem(menu, 'a')).toBe(true);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('runs a nested enabled item', () => {
    const action = vi.fn();
    const menu: MenuItem[] = [{ id: 'p', submenu: [{ id: 'child', action }] }];
    expect(runItem(menu, 'child')).toBe(true);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('does not call a disabled item and returns false', () => {
    const action = vi.fn();
    const menu: MenuItem[] = [{ id: 'a', disabled: true, action }];
    expect(runItem(menu, 'a')).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });

  it('returns false for an item with no action', () => {
    const menu: MenuItem[] = [{ id: 'a' }];
    expect(runItem(menu, 'a')).toBe(false);
  });

  it('returns false when the item is not found', () => {
    const action = vi.fn();
    const menu: MenuItem[] = [{ id: 'a', action }];
    expect(runItem(menu, 'missing')).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });
});
