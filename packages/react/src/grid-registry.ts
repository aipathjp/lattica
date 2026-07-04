/**
 * Grid instance registry — tracks every mounted `<LatticaGrid>` so callers can
 * force-commit or cancel in-flight edits across all grids at once (e.g. right
 * before opening a modal or switching tabs, replacing blur-all-grids DOM
 * hacks). Module-scope state only; no DOM access at evaluation time, so it is
 * SSR-safe.
 */

/** Commit/cancel hooks a mounted grid contributes to the registry. */
export interface GridEditingHooks {
  /** Commit the in-flight edit through the normal commit path; true if one existed. */
  commit(): boolean;
  /** Cancel the in-flight edit; true if one existed. */
  cancel(): boolean;
}

const registry = new Set<GridEditingHooks>();

/**
 * Register a mounted grid's editing hooks. Returns the unregister function
 * (called on unmount). Internal — `<LatticaGrid>` calls this automatically.
 */
export function registerGridInstance(hooks: GridEditingHooks): () => void {
  registry.add(hooks);
  return () => {
    registry.delete(hooks);
  };
}

/**
 * Commit the in-flight edit of every mounted `<LatticaGrid>` through the
 * normal commit path. Returns the number of grids that were actually editing.
 */
export function commitAllEditing(): number {
  let committed = 0;
  for (const hooks of [...registry]) {
    if (hooks.commit()) {
      committed += 1;
    }
  }
  return committed;
}

/**
 * Cancel the in-flight edit of every mounted `<LatticaGrid>` (discarding the
 * draft). Returns the number of grids that were actually editing.
 */
export function cancelAllEditing(): number {
  let cancelled = 0;
  for (const hooks of [...registry]) {
    if (hooks.cancel()) {
      cancelled += 1;
    }
  }
  return cancelled;
}
