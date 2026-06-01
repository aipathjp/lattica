import { describe, it, expect } from 'vitest';
import { CollabSession } from './session.js';
import { InMemoryNetwork } from './transport.js';

describe('CollabSession', () => {
  it('propagates local edits to other sessions', () => {
    const net = new InMemoryNetwork();
    const alice = new CollabSession('alice', net.connect(), { name: 'Alice' });
    const bob = new CollabSession('bob', net.connect(), { name: 'Bob' });

    alice.setCell('r1', 'hello');
    expect(bob.doc.get('r1')).toBe('hello');

    bob.setCell('r2', 42);
    expect(alice.doc.get('r2')).toBe(42);
  });

  it('converges on concurrent edits to the same cell', () => {
    const net = new InMemoryNetwork();
    const alice = new CollabSession('alice', net.connect());
    const bob = new CollabSession('bob', net.connect());
    alice.setCell('x', 1);
    bob.setCell('x', 2);
    expect(alice.doc.get('x')).toBe(bob.doc.get('x'));
  });

  it('shares presence including session metadata', () => {
    const net = new InMemoryNetwork();
    const alice = new CollabSession('alice', net.connect(), { name: 'Alice', color: '#f00' });
    const bob = new CollabSession('bob', net.connect());

    alice.updatePresence({ active: { row: 3, col: 4 } });
    const seen = bob.presence.get('alice');
    expect(seen).toMatchObject({ name: 'Alice', color: '#f00', active: { row: 3, col: 4 } });
    // Alice also records her own presence locally.
    expect(alice.presence.get('alice')?.active).toEqual({ row: 3, col: 4 });
  });

  it('removes presence when a peer leaves', () => {
    const net = new InMemoryNetwork();
    const alice = new CollabSession('alice', net.connect());
    const bob = new CollabSession('bob', net.connect());
    bob.updatePresence({ active: { row: 0, col: 0 } });
    expect(alice.presence.get('bob')).toBeDefined();
    bob.leave();
    expect(alice.presence.get('bob')).toBeUndefined();
  });

  it('ignores further messages after leaving and is idempotent', () => {
    const net = new InMemoryNetwork();
    const alice = new CollabSession('alice', net.connect());
    const bob = new CollabSession('bob', net.connect());
    alice.leave();
    alice.leave(); // no-op second call
    bob.setCell('x', 1);
    // Alice unsubscribed, so she no longer receives the edit.
    expect(alice.doc.get('x')).toBeNull();
  });
});
