/**
 * Runtime consumption smoke test: import the BUILT packages by their public
 * names (as an external project would) and assert they work end-to-end. Run
 * after `pnpm build` with `node scripts/verify-consumption.mjs`.
 */
import assert from 'node:assert/strict';
import { SheetEngine } from '@lattica/formula';
import { matrixToXlsx, serializeTsv, parseTsv } from '@lattica/io';
import { CollabSession, InMemoryNetwork, keyBetween } from '@lattica/collab';
import { columnIndexToLabel } from '@lattica/core';

// core
assert.equal(columnIndexToLabel(26), 'AA');

// formula
const sheet = new SheetEngine();
sheet.setContent({ row: 0, col: 0 }, 10);
sheet.setContent({ row: 1, col: 0 }, 20);
sheet.setContent({ row: 2, col: 0 }, '=SUM(A1:A2)');
assert.equal(sheet.getValue({ row: 2, col: 0 }), 30);

// io
assert.equal(serializeTsv([['a', 'b']]), 'a\tb');
assert.deepEqual(parseTsv('a\tb'), [['a', 'b']]);
const xlsx = matrixToXlsx([['Name', 'Score'], ['Ann', 92]]);
assert.ok(xlsx[0] === 0x50 && xlsx[1] === 0x4b, 'xlsx starts with PK');

// collab
const net = new InMemoryNetwork();
const a = new CollabSession('a', net.connect());
const b = new CollabSession('b', net.connect());
a.setCell('r1', 'hello');
assert.equal(b.doc.get('r1'), 'hello');
assert.ok(keyBetween(null, null).length > 0);

console.log('✓ Lattica packages consumed successfully from built dist');
