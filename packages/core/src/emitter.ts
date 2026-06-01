/**
 * A tiny typed event emitter used across Lattica for decoupled communication
 * between the model layer and the renderer. Zero dependencies.
 */

export type EventMap = Record<string, unknown>;
export type Handler<T> = (payload: T) => void;

/**
 * `Events` is a record mapping event names to payload types. The constraint is
 * intentionally loose (no `extends EventMap`) so that plain `interface`
 * definitions — which lack an index signature — can be used as `Events`.
 */
export class Emitter<Events> {
  private readonly handlers = new Map<keyof Events, Set<Handler<unknown>>>();

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    let set = this.handlers.get(event);
    if (set === undefined) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<unknown>);
    return () => this.off(event, handler);
  }

  /** Subscribe to an event for a single emission. */
  once<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    const off = this.on(event, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  /** Remove a previously-registered handler. */
  off<K extends keyof Events>(event: K, handler: Handler<Events[K]>): void {
    const set = this.handlers.get(event);
    if (set !== undefined) {
      set.delete(handler as Handler<unknown>);
      if (set.size === 0) {
        this.handlers.delete(event);
      }
    }
  }

  /** Emit an event to all current subscribers. */
  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.handlers.get(event);
    if (set === undefined) {
      return;
    }
    // Snapshot so handlers may unsubscribe during emission.
    for (const handler of [...set]) {
      handler(payload);
    }
  }

  /** Number of handlers for an event (or all events if omitted). */
  listenerCount(event?: keyof Events): number {
    if (event !== undefined) {
      return this.handlers.get(event)?.size ?? 0;
    }
    let total = 0;
    for (const set of this.handlers.values()) {
      total += set.size;
    }
    return total;
  }

  /** Remove all handlers (optionally for a single event). */
  clear(event?: keyof Events): void {
    if (event !== undefined) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }
}
