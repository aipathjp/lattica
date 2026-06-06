import { describe, it, expect, vi } from 'vitest';
import { CommentModel } from './comments.js';

describe('CommentModel', () => {
  it('sets and gets a comment', () => {
    const m = new CommentModel();
    m.set(1, 2, 'hello');
    expect(m.get(1, 2)).toBe('hello');
  });

  it('returns null for a missing comment', () => {
    const m = new CommentModel();
    expect(m.get(0, 0)).toBeNull();
  });

  it('reports has() correctly', () => {
    const m = new CommentModel();
    expect(m.has(3, 4)).toBe(false);
    m.set(3, 4, 'note');
    expect(m.has(3, 4)).toBe(true);
  });

  it('overwrites an existing comment', () => {
    const m = new CommentModel();
    m.set(0, 0, 'first');
    m.set(0, 0, 'second');
    expect(m.get(0, 0)).toBe('second');
    expect(m.list()).toHaveLength(1);
  });

  it('removes a comment when set with empty text', () => {
    const m = new CommentModel();
    m.set(2, 2, 'x');
    m.set(2, 2, '');
    expect(m.has(2, 2)).toBe(false);
  });

  it('removes a comment when set with whitespace-only text', () => {
    const m = new CommentModel();
    m.set(2, 2, 'x');
    m.set(2, 2, '   ');
    expect(m.has(2, 2)).toBe(false);
  });

  it('does not store a blank comment for a fresh cell', () => {
    const m = new CommentModel();
    m.set(5, 5, '');
    expect(m.has(5, 5)).toBe(false);
    expect(m.list()).toEqual([]);
  });

  it('preserves untrimmed text content', () => {
    const m = new CommentModel();
    m.set(1, 1, '  padded  ');
    expect(m.get(1, 1)).toBe('  padded  ');
  });

  it('remove() returns true when a comment existed', () => {
    const m = new CommentModel();
    m.set(1, 1, 'x');
    expect(m.remove(1, 1)).toBe(true);
    expect(m.has(1, 1)).toBe(false);
  });

  it('remove() returns false when nothing to remove', () => {
    const m = new CommentModel();
    expect(m.remove(1, 1)).toBe(false);
  });

  it('lists snapshot copies', () => {
    const m = new CommentModel();
    m.set(0, 0, 'a');
    m.set(1, 1, 'b');
    const list = m.list();
    expect(list).toEqual([
      { row: 0, col: 0, text: 'a' },
      { row: 1, col: 1, text: 'b' },
    ]);
    list[0]!.text = 'mutated';
    expect(m.get(0, 0)).toBe('a');
  });

  it('clears all comments', () => {
    const m = new CommentModel();
    m.set(0, 0, 'a');
    m.set(1, 1, 'b');
    m.clear();
    expect(m.list()).toEqual([]);
  });

  it('clear() is a no-op when already empty', () => {
    const m = new CommentModel();
    const fn = vi.fn();
    m.subscribe(fn);
    m.clear();
    expect(fn).not.toHaveBeenCalled();
  });

  describe('subscribe', () => {
    it('notifies on set', () => {
      const m = new CommentModel();
      const fn = vi.fn();
      m.subscribe(fn);
      m.set(0, 0, 'x');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('notifies on remove', () => {
      const m = new CommentModel();
      m.set(0, 0, 'x');
      const fn = vi.fn();
      m.subscribe(fn);
      m.remove(0, 0);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('does not notify on remove when nothing removed', () => {
      const m = new CommentModel();
      const fn = vi.fn();
      m.subscribe(fn);
      m.remove(0, 0);
      expect(fn).not.toHaveBeenCalled();
    });

    it('notifies on clear when non-empty', () => {
      const m = new CommentModel();
      m.set(0, 0, 'x');
      const fn = vi.fn();
      m.subscribe(fn);
      m.clear();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('stops notifying after unsubscribe', () => {
      const m = new CommentModel();
      const fn = vi.fn();
      const off = m.subscribe(fn);
      off();
      m.set(0, 0, 'x');
      expect(fn).not.toHaveBeenCalled();
    });
  });
});
