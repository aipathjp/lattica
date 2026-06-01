/**
 * Presence registry — tracks each collaborator's cursor and selection so the
 * renderer can draw remote carets. Presence is ephemeral (not part of the CRDT
 * document): the latest state per site wins, and sites can be removed when they
 * disconnect.
 */

import type { SiteId } from './crdt.js';

export interface PresenceState {
  readonly site: SiteId;
  /** Display name of the collaborator. */
  readonly name?: string;
  /** A CSS color for the caret/selection. */
  readonly color?: string;
  /** The active cell. */
  readonly active?: { row: number; col: number };
  /** The selected range (start/end addresses). */
  readonly selection?: {
    start: { row: number; col: number };
    end: { row: number; col: number };
  };
}

export type PresenceListener = (states: readonly PresenceState[]) => void;

export class PresenceRegistry {
  private readonly states = new Map<SiteId, PresenceState>();
  private readonly listeners = new Set<PresenceListener>();

  /** Insert or replace a site's presence. */
  set(state: PresenceState): void {
    this.states.set(state.site, state);
    this.emit();
  }

  /** Remove a site (e.g. on disconnect). */
  remove(site: SiteId): boolean {
    const existed = this.states.delete(site);
    if (existed) {
      this.emit();
    }
    return existed;
  }

  /** Presence of a single site. */
  get(site: SiteId): PresenceState | undefined {
    return this.states.get(site);
  }

  /** All known presence states, excluding the given local site if provided. */
  list(excludeSite?: SiteId): PresenceState[] {
    const out: PresenceState[] = [];
    for (const state of this.states.values()) {
      if (state.site !== excludeSite) {
        out.push(state);
      }
    }
    return out;
  }

  subscribe(listener: PresenceListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snapshot = [...this.states.values()];
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
