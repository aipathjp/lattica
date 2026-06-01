import { describe, it, expect, vi } from 'vitest';
import { PresenceRegistry } from './presence.js';

describe('PresenceRegistry', () => {
  it('sets and reads presence', () => {
    const reg = new PresenceRegistry();
    reg.set({ site: 'a', active: { row: 1, col: 2 } });
    expect(reg.get('a')).toMatchObject({ active: { row: 1, col: 2 } });
  });

  it('replaces presence on repeated set', () => {
    const reg = new PresenceRegistry();
    reg.set({ site: 'a', active: { row: 0, col: 0 } });
    reg.set({ site: 'a', active: { row: 5, col: 5 } });
    expect(reg.get('a')?.active).toEqual({ row: 5, col: 5 });
    expect(reg.list()).toHaveLength(1);
  });

  it('lists all sites and can exclude the local site', () => {
    const reg = new PresenceRegistry();
    reg.set({ site: 'a' });
    reg.set({ site: 'b' });
    expect(reg.list()).toHaveLength(2);
    expect(reg.list('a').map((s) => s.site)).toEqual(['b']);
  });

  it('removes a site', () => {
    const reg = new PresenceRegistry();
    reg.set({ site: 'a' });
    expect(reg.remove('a')).toBe(true);
    expect(reg.remove('a')).toBe(false);
    expect(reg.get('a')).toBeUndefined();
  });

  it('notifies subscribers on change', () => {
    const reg = new PresenceRegistry();
    const listener = vi.fn();
    const off = reg.subscribe(listener);
    reg.set({ site: 'a' });
    expect(listener).toHaveBeenCalledTimes(1);
    reg.remove('a');
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    reg.set({ site: 'b' });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('does not notify when removing an absent site', () => {
    const reg = new PresenceRegistry();
    const listener = vi.fn();
    reg.subscribe(listener);
    reg.remove('ghost');
    expect(listener).not.toHaveBeenCalled();
  });
});
