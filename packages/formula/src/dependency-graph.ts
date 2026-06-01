/**
 * DependencyGraph — tracks precedent/dependent edges between cells (keyed by
 * `"row,col"` strings) and supports the two operations the recalculation engine
 * needs: collecting the transitive set of cells affected by a change, and
 * topologically ordering a subset while flagging cells caught in a cycle.
 */

export class DependencyGraph {
  /** key → set of keys it directly references (its precedents). */
  private readonly precedents = new Map<string, Set<string>>();
  /** key → set of keys that directly reference it (its dependents). */
  private readonly dependents = new Map<string, Set<string>>();

  /** Replace the full precedent set of `key`, updating reverse edges. */
  setPrecedents(key: string, deps: Iterable<string>): void {
    // Remove stale reverse edges.
    const old = this.precedents.get(key);
    if (old !== undefined) {
      for (const dep of old) {
        this.dependents.get(dep)?.delete(key);
      }
    }
    const set = new Set(deps);
    // Self-loops are kept so that a self-referential formula (=A1+1 in A1) is
    // surfaced as a cycle by topoSort rather than silently evaluating.
    if (set.size === 0) {
      this.precedents.delete(key);
    } else {
      this.precedents.set(key, set);
      for (const dep of set) {
        let rev = this.dependents.get(dep);
        if (rev === undefined) {
          rev = new Set();
          this.dependents.set(dep, rev);
        }
        rev.add(key);
      }
    }
  }

  /** Remove all edges touching `key`. */
  clear(key: string): void {
    this.setPrecedents(key, []);
  }

  getPrecedents(key: string): ReadonlySet<string> {
    return this.precedents.get(key) ?? EMPTY;
  }

  getDependents(key: string): ReadonlySet<string> {
    return this.dependents.get(key) ?? EMPTY;
  }

  /** Seeds plus every cell transitively depending on them (the seeds included). */
  collectAffected(seeds: Iterable<string>): Set<string> {
    const affected = new Set<string>();
    const stack: string[] = [];
    for (const s of seeds) {
      if (!affected.has(s)) {
        affected.add(s);
        stack.push(s);
      }
    }
    while (stack.length > 0) {
      const key = stack.pop()!;
      for (const dep of this.getDependents(key)) {
        if (!affected.has(dep)) {
          affected.add(dep);
          stack.push(dep);
        }
      }
    }
    return affected;
  }
}

const EMPTY: ReadonlySet<string> = new Set();

export interface TopoResult {
  /** A valid evaluation order for the acyclic part. */
  readonly order: string[];
  /** Cells that participate in (or depend on) a cycle. */
  readonly cyclic: Set<string>;
}

/**
 * Topologically order `nodes` so that a node's precedents (restricted to the
 * `nodes` set) come first. Nodes in a cycle — and nodes that depend on a cycle
 * — are returned in `cyclic` and excluded from `order`.
 *
 * Uses Kahn's algorithm; whatever cannot be drained is cyclic.
 */
export function topoSort(
  nodes: Iterable<string>,
  precedentsOf: (key: string) => Iterable<string>,
): TopoResult {
  const nodeSet = new Set(nodes);
  const indegree = new Map<string, number>();
  const internalPrecedents = new Map<string, string[]>();

  for (const key of nodeSet) {
    const internal: string[] = [];
    for (const dep of precedentsOf(key)) {
      // A self-edge (dep === key) is retained so the node can never reach
      // indegree 0 and is therefore reported as cyclic.
      if (nodeSet.has(dep)) {
        internal.push(dep);
      }
    }
    internalPrecedents.set(key, internal);
    indegree.set(key, internal.length);
  }

  // Build forward adjacency (precedent → dependents within the set).
  const forward = new Map<string, string[]>();
  for (const [key, deps] of internalPrecedents) {
    for (const dep of deps) {
      let list = forward.get(dep);
      if (list === undefined) {
        list = [];
        forward.set(dep, list);
      }
      list.push(key);
    }
  }

  const queue: string[] = [];
  for (const [key, deg] of indegree) {
    if (deg === 0) {
      queue.push(key);
    }
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const key = queue.shift()!;
    order.push(key);
    for (const dependent of forward.get(key) ?? []) {
      const deg = indegree.get(dependent)! - 1;
      indegree.set(dependent, deg);
      if (deg === 0) {
        queue.push(dependent);
      }
    }
  }

  const cyclic = new Set<string>();
  if (order.length !== nodeSet.size) {
    const ordered = new Set(order);
    for (const key of nodeSet) {
      if (!ordered.has(key)) {
        cyclic.add(key);
      }
    }
  }

  return { order, cyclic };
}
