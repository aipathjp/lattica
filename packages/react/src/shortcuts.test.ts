import { describe, it, expect, vi } from 'vitest';
import {
  normalizeChord,
  ShortcutRegistry,
  type ShortcutEvent,
} from './shortcuts.js';

describe('normalizeChord', () => {
  it('returns a plain lowercased key with no modifiers', () => {
    expect(normalizeChord({ key: 'A' })).toBe('a');
  });

  it('keeps arrow key names', () => {
    expect(normalizeChord({ key: 'ArrowDown' })).toBe('arrowdown');
  });

  it('treats ctrl as mod', () => {
    expect(normalizeChord({ key: 'z', ctrlKey: true })).toBe('mod+z');
  });

  it('treats meta as mod', () => {
    expect(normalizeChord({ key: 'z', metaKey: true })).toBe('mod+z');
  });

  it('collapses ctrl AND meta into a single mod', () => {
    expect(normalizeChord({ key: 'z', ctrlKey: true, metaKey: true })).toBe('mod+z');
  });

  it('emits alt alone', () => {
    expect(normalizeChord({ key: 'a', altKey: true })).toBe('alt+a');
  });

  it('emits shift alone', () => {
    expect(normalizeChord({ key: 'a', shiftKey: true })).toBe('shift+a');
  });

  it('orders modifiers alt < mod < shift regardless of field order', () => {
    expect(
      normalizeChord({ key: 'z', shiftKey: true, ctrlKey: true, altKey: true }),
    ).toBe('alt+mod+shift+z');
  });

  it('orders mod + shift', () => {
    expect(normalizeChord({ key: 'z', shiftKey: true, metaKey: true })).toBe('mod+shift+z');
  });

  it('orders alt + shift (no mod)', () => {
    expect(normalizeChord({ key: 'x', shiftKey: true, altKey: true })).toBe('alt+shift+x');
  });

  it('orders alt + mod (no shift)', () => {
    expect(normalizeChord({ key: 'x', altKey: true, ctrlKey: true })).toBe('alt+mod+x');
  });

  it('treats explicit false modifier flags as absent', () => {
    const e: ShortcutEvent = {
      key: 'B',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
    };
    expect(normalizeChord(e)).toBe('b');
  });
});

describe('ShortcutRegistry', () => {
  it('defaults the active context to global', () => {
    const reg = new ShortcutRegistry();
    expect(reg.getContext()).toBe('global');
  });

  it('registers and handles a global chord', () => {
    const reg = new ShortcutRegistry();
    const action = vi.fn();
    reg.register('mod+z', action);
    const handled = reg.handle({ key: 'z', ctrlKey: true });
    expect(handled).toBe(true);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('returns false when no chord matches', () => {
    const reg = new ShortcutRegistry();
    expect(reg.handle({ key: 'q' })).toBe(false);
  });

  it('handles a chord registered in a specific active context', () => {
    const reg = new ShortcutRegistry();
    const action = vi.fn();
    reg.register('escape', action, 'editing');
    reg.setContext('editing');
    expect(reg.getContext()).toBe('editing');
    expect(reg.handle({ key: 'Escape' })).toBe(true);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('falls back to global when the active context has no match', () => {
    const reg = new ShortcutRegistry();
    const globalAction = vi.fn();
    reg.register('mod+s', globalAction);
    reg.register('escape', vi.fn(), 'editing');
    reg.setContext('editing');
    // mod+s is not in 'editing' → falls back to global.
    expect(reg.handle({ key: 's', metaKey: true })).toBe(true);
    expect(globalAction).toHaveBeenCalledTimes(1);
  });

  it('prefers the active context over global for the same chord', () => {
    const reg = new ShortcutRegistry();
    const globalAction = vi.fn();
    const ctxAction = vi.fn();
    reg.register('enter', globalAction);
    reg.register('enter', ctxAction, 'editing');
    reg.setContext('editing');
    expect(reg.handle({ key: 'Enter' })).toBe(true);
    expect(ctxAction).toHaveBeenCalledTimes(1);
    expect(globalAction).not.toHaveBeenCalled();
  });

  it('returns false when active context misses and global also misses', () => {
    const reg = new ShortcutRegistry();
    reg.register('escape', vi.fn(), 'editing');
    reg.setContext('editing');
    expect(reg.handle({ key: 'q' })).toBe(false);
  });

  it('last registration wins for the same chord in the same context', () => {
    const reg = new ShortcutRegistry();
    const first = vi.fn();
    const second = vi.fn();
    reg.register('mod+z', first);
    reg.register('mod+z', second);
    expect(reg.handle({ key: 'z', ctrlKey: true })).toBe(true);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('unregister removes the binding', () => {
    const reg = new ShortcutRegistry();
    const action = vi.fn();
    const off = reg.register('mod+z', action);
    off();
    expect(reg.handle({ key: 'z', ctrlKey: true })).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });

  it('unregister is a no-op when the binding was replaced (only removes its own)', () => {
    const reg = new ShortcutRegistry();
    const first = vi.fn();
    const second = vi.fn();
    const offFirst = reg.register('mod+z', first);
    reg.register('mod+z', second); // replaces first
    offFirst(); // must NOT remove second
    expect(reg.handle({ key: 'z', ctrlKey: true })).toBe(true);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('unregister is a no-op when the whole context is gone', () => {
    const reg = new ShortcutRegistry();
    const off = reg.register('mod+z', vi.fn(), 'editing');
    // No way to drop a context publicly, so register then unregister twice:
    off();
    expect(() => off()).not.toThrow();
    expect(reg.list('editing')).toEqual([]);
  });

  it('list returns chords for a given context', () => {
    const reg = new ShortcutRegistry();
    reg.register('mod+z', vi.fn());
    reg.register('mod+shift+z', vi.fn());
    expect(reg.list('global').sort()).toEqual(['mod+shift+z', 'mod+z']);
  });

  it('list defaults to the active context', () => {
    const reg = new ShortcutRegistry();
    reg.register('escape', vi.fn(), 'editing');
    reg.setContext('editing');
    expect(reg.list()).toEqual(['escape']);
  });

  it('list returns empty for an unknown context', () => {
    const reg = new ShortcutRegistry();
    expect(reg.list('nope')).toEqual([]);
  });

  it('normalizes various chord spellings on register (parser matches normalizeChord)', () => {
    const reg = new ShortcutRegistry();
    const action = vi.fn();
    // ctrl/meta/cmd/command/control all map to mod; option maps to alt.
    reg.register('Command + Shift + Z', action);
    expect(reg.list('global')).toEqual(['mod+shift+z']);
    expect(reg.handle({ key: 'z', ctrlKey: true, shiftKey: true })).toBe(true);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('recognises every modifier alias spelling', () => {
    const reg = new ShortcutRegistry();
    reg.register('option+x', vi.fn());
    reg.register('alt+y', vi.fn());
    reg.register('ctrl+a', vi.fn());
    reg.register('control+b', vi.fn());
    reg.register('meta+c', vi.fn());
    reg.register('cmd+d', vi.fn());
    reg.register('mod+e', vi.fn());
    reg.register('shift+f', vi.fn());
    expect(reg.list('global').sort()).toEqual(
      ['alt+x', 'alt+y', 'mod+a', 'mod+b', 'mod+c', 'mod+d', 'mod+e', 'shift+f'].sort(),
    );
  });

  it('ignores empty tokens / surrounding whitespace in a chord', () => {
    const reg = new ShortcutRegistry();
    reg.register('  mod + + z ', vi.fn());
    expect(reg.list('global')).toEqual(['mod+z']);
  });
});
