/**
 * CollabSession — wires a {@link TableDocument}, a {@link PresenceRegistry}, and
 * a {@link CollabTransport} together: local edits are applied and broadcast,
 * remote messages are merged into the document/presence. This is the single
 * object the UI layer interacts with for realtime editing.
 */

import type { CellValue } from '@lattica/core';
import { TableDocument, type CellOp } from './crdt.js';
import { PresenceRegistry, type PresenceState } from './presence.js';
import type { CollabTransport } from './transport.js';

export interface CollabSessionOptions {
  /** Display name advertised to peers via presence. */
  name?: string;
  /** Caret/selection color advertised to peers. */
  color?: string;
}

export class CollabSession {
  readonly doc: TableDocument;
  readonly presence = new PresenceRegistry();
  private readonly unsubscribe: () => void;
  private readonly meta: CollabSessionOptions;
  private closed = false;

  constructor(
    readonly site: string,
    private readonly transport: CollabTransport,
    options: CollabSessionOptions = {},
  ) {
    this.doc = new TableDocument(site);
    this.meta = options;
    this.unsubscribe = transport.subscribe((message) => this.onMessage(message));
  }

  /** Apply a local cell edit and broadcast it. */
  setCell(key: string, value: CellValue): CellOp {
    const op = this.doc.setLocal(key, value);
    this.transport.send({ type: 'op', op });
    return op;
  }

  /** Update and broadcast this site's presence (cursor / selection). */
  updatePresence(partial: Omit<PresenceState, 'site'>): void {
    const state: PresenceState = {
      site: this.site,
      name: this.meta.name,
      color: this.meta.color,
      ...partial,
    };
    this.presence.set(state);
    this.transport.send({ type: 'presence', state });
  }

  /** Broadcast a leave notice and stop listening. */
  leave(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.transport.send({ type: 'leave', site: this.site });
    this.unsubscribe();
  }

  private onMessage(message: import('./transport.js').CollabMessage): void {
    switch (message.type) {
      case 'op':
        this.doc.applyRemote(message.op);
        return;
      case 'presence':
        this.presence.set(message.state);
        return;
      case 'leave':
        this.presence.remove(message.site);
        return;
    }
  }
}
