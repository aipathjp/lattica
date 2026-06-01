/**
 * Transport abstraction. The collaboration layer is agnostic to how messages
 * travel between replicas; a Supabase Realtime / WebSocket adapter implements
 * {@link CollabTransport}. {@link InMemoryNetwork} provides a synchronous,
 * in-process bus used for tests, demos, and single-process multi-pane editing.
 */

import type { CellOp } from './crdt.js';
import type { PresenceState } from './presence.js';

export type CollabMessage =
  | { readonly type: 'op'; readonly op: CellOp }
  | { readonly type: 'presence'; readonly state: PresenceState }
  | { readonly type: 'leave'; readonly site: string };

export type MessageHandler = (message: CollabMessage) => void;

export interface CollabTransport {
  /** Broadcast a message to all other replicas. */
  send(message: CollabMessage): void;
  /** Subscribe to messages from other replicas. Returns an unsubscribe fn. */
  subscribe(handler: MessageHandler): () => void;
}

/**
 * A synchronous in-process broadcast bus. Each `connect()` returns a transport
 * whose `send` is delivered to every *other* connected transport.
 */
export class InMemoryNetwork {
  private readonly peers = new Set<InMemoryTransport>();

  connect(): CollabTransport {
    const transport = new InMemoryTransport(this);
    this.peers.add(transport);
    return transport;
  }

  /** Number of connected transports. */
  get size(): number {
    return this.peers.size;
  }

  /** @internal */
  broadcast(from: InMemoryTransport, message: CollabMessage): void {
    for (const peer of this.peers) {
      if (peer !== from) {
        peer.deliver(message);
      }
    }
  }

  /** @internal */
  disconnect(transport: InMemoryTransport): void {
    this.peers.delete(transport);
  }
}

class InMemoryTransport implements CollabTransport {
  private readonly handlers = new Set<MessageHandler>();

  constructor(private readonly network: InMemoryNetwork) {}

  send(message: CollabMessage): void {
    this.network.broadcast(this, message);
  }

  subscribe(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /** Leave the network; no further messages are delivered. */
  close(): void {
    this.network.disconnect(this);
    this.handlers.clear();
  }

  /** @internal */
  deliver(message: CollabMessage): void {
    for (const handler of this.handlers) {
      handler(message);
    }
  }
}

export type { InMemoryTransport };
