import { describe, it, expect, vi } from 'vitest';
import { TableDocument, type CellOp } from './crdt.js';

describe('TableDocument local edits', () => {
  it('sets and reads values', () => {
    const doc = new TableDocument('a');
    doc.setLocal('r1', 42);
    expect(doc.get('r1')).toBe(42);
    expect(doc.has('r1')).toBe(true);
    expect(doc.get('missing')).toBeNull();
    expect(doc.has('missing')).toBe(false);
  });

  it('advances the Lamport clock on each local write', () => {
    const doc = new TableDocument('a');
    expect(doc.getClock()).toBe(0);
    doc.setLocal('x', 1);
    doc.setLocal('y', 2);
    expect(doc.getClock()).toBe(2);
  });

  it('treats a null value as cleared', () => {
    const doc = new TableDocument('a');
    doc.setLocal('x', 5);
    doc.setLocal('x', null);
    expect(doc.has('x')).toBe(false);
    expect(doc.get('x')).toBeNull();
  });

  it('notifies subscribers of local edits', () => {
    const doc = new TableDocument('a');
    const listener = vi.fn();
    const off = doc.subscribe(listener);
    doc.setLocal('x', 1);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    doc.setLocal('y', 2);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('LWW conflict resolution', () => {
  const op = (key: string, value: number, clock: number, site: string): CellOp => ({
    kind: 'cell',
    key,
    value,
    clock,
    site,
  });

  it('higher clock wins', () => {
    const doc = new TableDocument('a');
    doc.applyRemote(op('x', 1, 1, 'b'));
    doc.applyRemote(op('x', 2, 5, 'b'));
    expect(doc.get('x')).toBe(2);
    // A lower-clock op does not override.
    doc.applyRemote(op('x', 9, 3, 'b'));
    expect(doc.get('x')).toBe(2);
  });

  it('breaks clock ties by site id', () => {
    const doc = new TableDocument('a');
    doc.applyRemote(op('x', 1, 4, 'b'));
    doc.applyRemote(op('x', 2, 4, 'z')); // 'z' > 'b'
    expect(doc.get('x')).toBe(2);
    doc.applyRemote(op('x', 3, 4, 'a')); // 'a' < 'z'
    expect(doc.get('x')).toBe(2);
  });

  it('advances the local clock to track remote ops', () => {
    const doc = new TableDocument('a');
    doc.applyRemote(op('x', 1, 10, 'b'));
    expect(doc.getClock()).toBe(10);
    // Subsequent local edit exceeds the observed clock.
    doc.setLocal('y', 1);
    expect(doc.getClock()).toBe(11);
  });

  it('reports whether the visible value changed', () => {
    const doc = new TableDocument('a');
    expect(doc.applyRemote(op('x', 1, 1, 'b'))).toBe(true);
    // Same value, higher clock -> register updates but value unchanged.
    expect(doc.applyRemote(op('x', 1, 2, 'b'))).toBe(false);
    // Losing op -> no change.
    expect(doc.applyRemote(op('x', 7, 1, 'a'))).toBe(false);
  });
});

describe('convergence', () => {
  it('two replicas converge regardless of delivery order', () => {
    const a = new TableDocument('a');
    const b = new TableDocument('b');

    const opA1 = a.setLocal('x', 10);
    const opA2 = a.setLocal('y', 20);
    const opB1 = b.setLocal('x', 99);

    // Deliver in different orders to each replica.
    b.applyRemote(opA1);
    b.applyRemote(opA2);
    a.applyRemote(opB1);

    expect(a.snapshot()).toEqual(b.snapshot());
  });

  it('merge is idempotent', () => {
    const a = new TableDocument('a');
    a.setLocal('x', 1);
    const b = new TableDocument('b');
    b.setLocal('y', 2);
    b.merge(a);
    const before = b.snapshot();
    b.merge(a); // applying again changes nothing
    expect(b.snapshot()).toEqual(before);
    expect(before).toEqual({ x: 1, y: 2 });
  });

  it('exports ops including cleared cells for full sync', () => {
    const doc = new TableDocument('a');
    doc.setLocal('x', 1);
    doc.setLocal('x', null);
    const ops = doc.exportOps();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ key: 'x', value: null });
  });
});
