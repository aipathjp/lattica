# @lattica/collab

Realtime collaboration primitives for Lattica. It provides a last-writer-wins
CRDT for cell values (`TableDocument`), a presence registry for remote cursors
and selections, a transport abstraction with an in-memory implementation for
tests and local demos, and `CollabSession` which wires them together into the
single object a UI layer talks to. Fractional order keys (`keyBetween`) support
stable ordering of inserted rows/columns.

## Install

```sh
pnpm add @lattica/collab
```

## API overview

### CollabSession + InMemoryNetwork

A `CollabSession` applies and broadcasts local edits and merges remote ones. The
`InMemoryNetwork` connects multiple sessions in-process — ideal for tests.

```ts
import { CollabSession, InMemoryNetwork } from '@lattica/collab';

const network = new InMemoryNetwork();
const alice = new CollabSession('alice', network.connect(), { name: 'Alice', color: '#e11' });
const bob = new CollabSession('bob', network.connect(), { name: 'Bob' });

alice.setCell('A1', 'hello');
bob.doc.get('A1'); // 'hello' — replicated through the network

alice.updatePresence({ cursor: 'B2' });
alice.leave();
```

### TableDocument (CRDT)

`TableDocument` is a self-contained LWW cell store. `setLocal` produces a
`CellOp` to broadcast; `applyRemote` merges an incoming op; `merge` folds in
another document's ops.

```ts
import { TableDocument } from '@lattica/collab';

const doc = new TableDocument('site-1');
const op = doc.setLocal('A1', 42);
doc.get('A1');     // 42
doc.snapshot();    // { A1: 42 }

const other = new TableDocument('site-2');
other.applyRemote(op);
```

### Presence

```ts
import { PresenceRegistry, type PresenceState } from '@lattica/collab';

const presence = new PresenceRegistry();
presence.set({ site: 'bob', name: 'Bob', cursor: 'C3' } as PresenceState);
presence.remove('bob');
```

### Order keys

`keyBetween` / `keysBetween` generate fractional-index strings for ordering
inserted items; `isOrderKey` validates them.

```ts
import { keyBetween } from '@lattica/collab';

const k = keyBetween(null, null);  // first key
const k2 = keyBetween(k, null);    // sorts after k
```

To bridge a real backend, implement the `CollabTransport` interface
(`send` + `subscribe`) and pass it to `CollabSession` in place of the in-memory
transport.
