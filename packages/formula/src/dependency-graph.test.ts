import { describe, it, expect } from 'vitest';
import { DependencyGraph, topoSort } from './dependency-graph.js';

describe('DependencyGraph edges', () => {
  it('tracks precedents and dependents', () => {
    const g = new DependencyGraph();
    g.setPrecedents('C', ['A', 'B']);
    expect([...g.getPrecedents('C')].sort()).toEqual(['A', 'B']);
    expect([...g.getDependents('A')]).toEqual(['C']);
    expect([...g.getDependents('B')]).toEqual(['C']);
  });

  it('replaces precedents and cleans stale reverse edges', () => {
    const g = new DependencyGraph();
    g.setPrecedents('C', ['A', 'B']);
    g.setPrecedents('C', ['A']);
    expect([...g.getDependents('B')]).toEqual([]);
    expect([...g.getDependents('A')]).toEqual(['C']);
  });

  it('retains self-loops so cycles can be detected', () => {
    const g = new DependencyGraph();
    g.setPrecedents('A', ['A', 'B']);
    expect([...g.getPrecedents('A')].sort()).toEqual(['A', 'B']);
    const { cyclic } = topoSort(['A', 'B'], (k) => g.getPrecedents(k));
    expect(cyclic.has('A')).toBe(true);
  });

  it('clears a node', () => {
    const g = new DependencyGraph();
    g.setPrecedents('C', ['A']);
    g.clear('C');
    expect([...g.getPrecedents('C')]).toEqual([]);
    expect([...g.getDependents('A')]).toEqual([]);
  });

  it('returns empty sets for unknown nodes', () => {
    const g = new DependencyGraph();
    expect(g.getPrecedents('X').size).toBe(0);
    expect(g.getDependents('X').size).toBe(0);
  });

  it('setting empty precedents removes the node entry', () => {
    const g = new DependencyGraph();
    g.setPrecedents('C', ['A']);
    g.setPrecedents('C', []);
    expect(g.getPrecedents('C').size).toBe(0);
  });
});

describe('collectAffected', () => {
  it('gathers transitive dependents including seeds', () => {
    const g = new DependencyGraph();
    // A -> B -> C (C depends on B depends on A)
    g.setPrecedents('B', ['A']);
    g.setPrecedents('C', ['B']);
    g.setPrecedents('D', ['A']);
    const affected = g.collectAffected(['A']);
    expect([...affected].sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('handles multiple seeds and shared dependents without duplication', () => {
    const g = new DependencyGraph();
    g.setPrecedents('C', ['A', 'B']);
    const affected = g.collectAffected(['A', 'B']);
    expect([...affected].sort()).toEqual(['A', 'B', 'C']);
  });
});

describe('topoSort', () => {
  it('orders precedents before dependents', () => {
    const g = new DependencyGraph();
    g.setPrecedents('B', ['A']);
    g.setPrecedents('C', ['B']);
    const { order, cyclic } = topoSort(['A', 'B', 'C'], (k) => g.getPrecedents(k));
    expect(cyclic.size).toBe(0);
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('C'));
  });

  it('ignores precedents outside the node set', () => {
    const g = new DependencyGraph();
    g.setPrecedents('B', ['A']); // A not in the sorted set
    const { order } = topoSort(['B'], (k) => g.getPrecedents(k));
    expect(order).toEqual(['B']);
  });

  it('detects a simple cycle', () => {
    const g = new DependencyGraph();
    g.setPrecedents('A', ['B']);
    g.setPrecedents('B', ['A']);
    const { order, cyclic } = topoSort(['A', 'B'], (k) => g.getPrecedents(k));
    expect(order).toEqual([]);
    expect([...cyclic].sort()).toEqual(['A', 'B']);
  });

  it('separates an acyclic prefix from a cyclic remainder', () => {
    const g = new DependencyGraph();
    g.setPrecedents('B', ['A']);
    g.setPrecedents('C', ['D']);
    g.setPrecedents('D', ['C']);
    const { order, cyclic } = topoSort(['A', 'B', 'C', 'D'], (k) => g.getPrecedents(k));
    expect(order).toContain('A');
    expect(order).toContain('B');
    expect([...cyclic].sort()).toEqual(['C', 'D']);
  });
});
