import { describe, it, expect, vi } from 'vitest';
import { HookBus } from './hooks.js';

interface Hooks {
  beforeEdit: { value: number };
  afterEdit: { value: number };
}

describe('HookBus', () => {
  it('runs handlers in registration order with the payload', () => {
    const bus = new HookBus<Hooks>();
    const order: number[] = [];
    bus.on('beforeEdit', (p) => {
      order.push(1);
      expect(p).toEqual({ value: 7 });
    });
    bus.on('beforeEdit', () => {
      order.push(2);
    });
    const result = bus.run('beforeEdit', { value: 7 });
    expect(result).toBe(true);
    expect(order).toEqual([1, 2]);
  });

  it('run returns true when there are no handlers', () => {
    const bus = new HookBus<Hooks>();
    expect(bus.run('afterEdit', { value: 1 })).toBe(true);
  });

  it('continues when handlers return void or true', () => {
    const bus = new HookBus<Hooks>();
    const a = vi.fn(() => undefined);
    const b = vi.fn(() => true);
    const c = vi.fn();
    bus.on('beforeEdit', a);
    bus.on('beforeEdit', b);
    bus.on('beforeEdit', c);
    expect(bus.run('beforeEdit', { value: 1 })).toBe(true);
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
    expect(c).toHaveBeenCalledOnce();
  });

  it('cancels and stops subsequent handlers when one returns false', () => {
    const bus = new HookBus<Hooks>();
    const first = vi.fn(() => true);
    const cancel = vi.fn(() => false);
    const never = vi.fn();
    bus.on('beforeEdit', first);
    bus.on('beforeEdit', cancel);
    bus.on('beforeEdit', never);
    expect(bus.run('beforeEdit', { value: 1 })).toBe(false);
    expect(first).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
    expect(never).not.toHaveBeenCalled();
  });

  it('unsubscribes via the returned function', () => {
    const bus = new HookBus<Hooks>();
    const fn = vi.fn();
    const off = bus.on('beforeEdit', fn);
    off();
    bus.run('beforeEdit', { value: 1 });
    expect(fn).not.toHaveBeenCalled();
    expect(bus.listenerCount('beforeEdit')).toBe(0);
  });

  it('off removes a handler and is a no-op for unknown hook/handler', () => {
    const bus = new HookBus<Hooks>();
    const fn = vi.fn();
    bus.on('beforeEdit', fn);
    bus.off('beforeEdit', fn);
    bus.run('beforeEdit', { value: 1 });
    expect(fn).not.toHaveBeenCalled();
    // off on a hook with no handlers
    bus.off('afterEdit', () => {});
    // off with a handler that was never registered (list exists, index -1)
    const other = vi.fn();
    bus.on('beforeEdit', () => {});
    bus.off('beforeEdit', other);
    expect(bus.listenerCount('beforeEdit')).toBe(1);
  });

  it('reports listenerCount per-hook and total', () => {
    const bus = new HookBus<Hooks>();
    expect(bus.listenerCount('beforeEdit')).toBe(0);
    expect(bus.listenerCount()).toBe(0);
    bus.on('beforeEdit', () => {});
    bus.on('beforeEdit', () => {});
    bus.on('afterEdit', () => {});
    expect(bus.listenerCount('beforeEdit')).toBe(2);
    expect(bus.listenerCount('afterEdit')).toBe(1);
    expect(bus.listenerCount()).toBe(3);
  });

  it('clear removes handlers per-hook and all', () => {
    const bus = new HookBus<Hooks>();
    bus.on('beforeEdit', () => {});
    bus.on('afterEdit', () => {});
    bus.clear('beforeEdit');
    expect(bus.listenerCount('beforeEdit')).toBe(0);
    expect(bus.listenerCount('afterEdit')).toBe(1);
    bus.clear();
    expect(bus.listenerCount()).toBe(0);
  });

  it('allows a handler to off() during run (snapshot semantics)', () => {
    const bus = new HookBus<Hooks>();
    const second = vi.fn();
    const first = vi.fn(() => {
      bus.off('beforeEdit', second);
    });
    bus.on('beforeEdit', first);
    bus.on('beforeEdit', second);
    // Both run on this pass because the list was snapshotted before iterating.
    expect(bus.run('beforeEdit', { value: 1 })).toBe(true);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    // On the next run, second has been removed.
    bus.run('beforeEdit', { value: 2 });
    expect(second).toHaveBeenCalledOnce();
    expect(first).toHaveBeenCalledTimes(2);
  });
});
