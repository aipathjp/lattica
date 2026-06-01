import { describe, it, expect, vi } from 'vitest';
import { InMemoryNetwork, type CollabMessage } from './transport.js';
import type { CellOp } from './crdt.js';

const sampleOp: CellOp = { kind: 'cell', key: 'x', value: 1, clock: 1, site: 'a' };
const opMsg: CollabMessage = { type: 'op', op: sampleOp };

describe('InMemoryNetwork', () => {
  it('broadcasts to other peers but not the sender', () => {
    const net = new InMemoryNetwork();
    const a = net.connect();
    const b = net.connect();
    const aHandler = vi.fn();
    const bHandler = vi.fn();
    a.subscribe(aHandler);
    b.subscribe(bHandler);

    a.send(opMsg);
    expect(bHandler).toHaveBeenCalledWith(opMsg);
    expect(aHandler).not.toHaveBeenCalled();
  });

  it('tracks the number of connected peers', () => {
    const net = new InMemoryNetwork();
    expect(net.size).toBe(0);
    net.connect();
    net.connect();
    expect(net.size).toBe(2);
  });

  it('delivers to multiple peers', () => {
    const net = new InMemoryNetwork();
    const a = net.connect();
    const b = net.connect();
    const c = net.connect();
    const bH = vi.fn();
    const cH = vi.fn();
    b.subscribe(bH);
    c.subscribe(cH);
    a.send(opMsg);
    expect(bH).toHaveBeenCalledTimes(1);
    expect(cH).toHaveBeenCalledTimes(1);
  });

  it('stops delivering after unsubscribe', () => {
    const net = new InMemoryNetwork();
    const a = net.connect();
    const b = net.connect();
    const handler = vi.fn();
    const off = b.subscribe(handler);
    off();
    a.send(opMsg);
    expect(handler).not.toHaveBeenCalled();
  });

  it('closing a transport removes it from the network', () => {
    const net = new InMemoryNetwork();
    const a = net.connect();
    const b = net.connect();
    const handler = vi.fn();
    b.subscribe(handler);
    // The concrete in-memory transport exposes close() to leave the network.
    (b as unknown as { close(): void }).close();
    expect(net.size).toBe(1);
    a.send(opMsg);
    expect(handler).not.toHaveBeenCalled();
  });
});
