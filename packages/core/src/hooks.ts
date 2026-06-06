/**
 * A tiny typed HOOK bus for extensibility. Unlike the {@link Emitter}, hooks
 * support cancelation: a handler returning `false` from a "before" hook stops
 * the run and signals the caller to abort the pending action. "after" hooks are
 * pure notifications whose return value is irrelevant.
 *
 * Zero dependencies; pure.
 */

/** A record mapping hook names to their payload types. */
export type HookMap = Record<string, unknown>;

/**
 * A hook handler. Returning `false` cancels the run (and stops subsequent
 * handlers); returning `void` or `true` lets the run continue.
 */
export type HookHandler<T> = (payload: T) => void | boolean;

/**
 * `H` is a record mapping hook names to payload types. The constraint is
 * intentionally loose (no `extends HookMap`) so that plain `interface`
 * definitions — which lack an index signature — can be used as `H`.
 */
export class HookBus<H> {
  private readonly handlers = new Map<keyof H, Array<HookHandler<unknown>>>();

  /** Register a handler. Returns an unsubscribe function. */
  on<K extends keyof H>(hook: K, fn: HookHandler<H[K]>): () => void {
    let list = this.handlers.get(hook);
    if (list === undefined) {
      list = [];
      this.handlers.set(hook, list);
    }
    list.push(fn as HookHandler<unknown>);
    return () => this.off(hook, fn);
  }

  /** Remove a previously-registered handler. */
  off<K extends keyof H>(hook: K, fn: HookHandler<H[K]>): void {
    const list = this.handlers.get(hook);
    if (list === undefined) {
      return;
    }
    const index = list.indexOf(fn as HookHandler<unknown>);
    if (index !== -1) {
      list.splice(index, 1);
    }
    if (list.length === 0) {
      this.handlers.delete(hook);
    }
  }

  /**
   * Run all handlers for `hook` in registration order. Stops at the first
   * handler that returns `false` (cancel) and returns `false`; otherwise runs
   * every handler and returns `true`.
   */
  run<K extends keyof H>(hook: K, payload: H[K]): boolean {
    const list = this.handlers.get(hook);
    if (list === undefined) {
      return true;
    }
    // Snapshot so a handler may off() (or on()) during the run.
    for (const fn of [...list]) {
      if (fn(payload) === false) {
        return false;
      }
    }
    return true;
  }

  /** Number of handlers for a hook (or all hooks if omitted). */
  listenerCount(hook?: keyof H): number {
    if (hook !== undefined) {
      return this.handlers.get(hook)?.length ?? 0;
    }
    let total = 0;
    for (const list of this.handlers.values()) {
      total += list.length;
    }
    return total;
  }

  /** Remove all handlers (optionally for a single hook). */
  clear(hook?: keyof H): void {
    if (hook !== undefined) {
      this.handlers.delete(hook);
    } else {
      this.handlers.clear();
    }
  }
}
