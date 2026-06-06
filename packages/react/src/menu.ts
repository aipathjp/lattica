/**
 * Pure model for context / dropdown menus. A menu is a flat-or-nested list of
 * {@link MenuItem}s; {@link buildMenu} normalizes a loosely-authored spec
 * (which may contain falsy holes and stray separators) into a clean tree, and
 * {@link findItem} / {@link runItem} let callers locate and invoke an item by
 * id without touching the DOM. Keeping this pure makes menu wiring fully
 * unit-testable.
 */

export interface MenuItem {
  id: string;
  label?: string;
  separator?: boolean;
  disabled?: boolean;
  action?: () => void;
  submenu?: MenuItem[];
}

/** A menu entry as authored: a real item, or a falsy hole that is dropped. */
export type MenuItemSpec = MenuItem | false | null | undefined;

/**
 * Normalize a menu spec into a clean {@link MenuItem} list:
 * - drop falsy entries (`false` / `null` / `undefined`);
 * - drop leading and trailing separators;
 * - collapse runs of consecutive separators into one;
 * - recurse into each item's `submenu`.
 */
export function buildMenu(items: MenuItemSpec[]): MenuItem[] {
  const present = items.filter((item): item is MenuItem => Boolean(item));

  const result: MenuItem[] = [];
  for (const item of present) {
    if (item.separator === true) {
      // Skip leading separators and any separator following another separator.
      const previous = result[result.length - 1];
      if (previous === undefined || previous.separator === true) {
        continue;
      }
      result.push(item);
      continue;
    }
    result.push(item.submenu === undefined ? item : { ...item, submenu: buildMenu(item.submenu) });
  }

  // Drop a single trailing separator (only one can exist after collapsing).
  const last = result[result.length - 1];
  if (last !== undefined && last.separator === true) {
    result.pop();
  }

  return result;
}

/** Depth-first search for an item by id, descending into submenus. */
export function findItem(items: MenuItem[], id: string): MenuItem | null {
  for (const item of items) {
    if (item.id === id) {
      return item;
    }
    if (item.submenu !== undefined) {
      const found = findItem(item.submenu, id);
      if (found !== null) {
        return found;
      }
    }
  }
  return null;
}

/**
 * Locate an item by id and invoke its action. Returns `true` only when the item
 * exists, is enabled, and has an action (which is then called); otherwise
 * returns `false` and calls nothing.
 */
export function runItem(items: MenuItem[], id: string): boolean {
  const item = findItem(items, id);
  if (item === null || item.disabled === true || item.action === undefined) {
    return false;
  }
  item.action();
  return true;
}
