import { describe, it, expect, vi } from 'vitest';
import { Emitter } from './emitter.js';

interface Events {
  change: { value: number };
  reset: void;
}

describe('Emitter', () => {
  it('subscribes and emits typed payloads', () => {
    const e = new Emitter<Events>();
    const handler = vi.fn();
    e.on('change', handler);
    e.emit('change', { value: 42 });
    expect(handler).toHaveBeenCalledWith({ value: 42 });
  });

  it('unsubscribes via returned function', () => {
    const e = new Emitter<Events>();
    const handler = vi.fn();
    const off = e.on('change', handler);
    off();
    e.emit('change', { value: 1 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('off removes a handler', () => {
    const e = new Emitter<Events>();
    const handler = vi.fn();
    e.on('change', handler);
    e.off('change', handler);
    e.emit('change', { value: 1 });
    expect(handler).not.toHaveBeenCalled();
    // off on unknown event is a no-op
    e.off('reset', () => {});
  });

  it('fires once handlers a single time', () => {
    const e = new Emitter<Events>();
    const handler = vi.fn();
    e.once('change', handler);
    e.emit('change', { value: 1 });
    e.emit('change', { value: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ value: 1 });
  });

  it('emitting an event with no listeners is safe', () => {
    const e = new Emitter<Events>();
    expect(() => e.emit('reset', undefined)).not.toThrow();
  });

  it('allows handlers to unsubscribe during emission', () => {
    const e = new Emitter<Events>();
    const calls: string[] = [];
    const offB = () => e.off('change', b);
    const a = () => {
      calls.push('a');
      offB();
    };
    const b = () => calls.push('b');
    e.on('change', a);
    e.on('change', b);
    e.emit('change', { value: 1 });
    e.emit('change', { value: 2 });
    // b is removed during the first emission's snapshot still ran once.
    expect(calls.filter((c) => c === 'a')).toHaveLength(2);
  });

  it('counts listeners per event and total', () => {
    const e = new Emitter<Events>();
    e.on('change', () => {});
    e.on('change', () => {});
    e.on('reset', () => {});
    expect(e.listenerCount('change')).toBe(2);
    expect(e.listenerCount('reset')).toBe(1);
    expect(e.listenerCount()).toBe(3);
    expect(e.listenerCount('change' as keyof Events)).toBe(2);
  });

  it('clears handlers per-event and globally', () => {
    const e = new Emitter<Events>();
    e.on('change', () => {});
    e.on('reset', () => {});
    e.clear('change');
    expect(e.listenerCount('change')).toBe(0);
    expect(e.listenerCount('reset')).toBe(1);
    e.clear();
    expect(e.listenerCount()).toBe(0);
  });
});
