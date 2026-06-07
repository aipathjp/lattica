/**
 * Dynamic-array spill behavior of the SheetEngine: a multi-cell array result
 * occupies its anchor plus adjacent cells, blocks on collision (#SPILL!), and
 * propagates to dependents through the dependency graph.
 */

import { describe, it, expect } from 'vitest';
import { SheetEngine } from './engine.js';
import { createDefaultFunctions } from './functions.js';
import { FormulaError } from './errors.js';
import type { Matrix } from './values.js';

const A = (row: number, col: number) => ({ row, col });

/** Seed a 2×2 block A1:B2 = [[1,2],[3,4]]. */
function seedBlock(e: SheetEngine): void {
  e.setContent(A(0, 0), 1);
  e.setContent(A(0, 1), 2);
  e.setContent(A(1, 0), 3);
  e.setContent(A(1, 1), 4);
}

describe('spill — basic', () => {
  it('spills a range into adjacent cells with the anchor showing top-left', () => {
    const e = new SheetEngine();
    seedBlock(e);
    // =A1:B2 anchored at D1 spills a 2x2 block into D1:E2.
    e.setContent(A(0, 3), '=A1:B2');
    expect(e.getValue(A(0, 3))).toBe(1); // anchor (top-left)
    expect(e.getValue(A(0, 4))).toBe(2); // spilled right
    expect(e.getValue(A(1, 3))).toBe(3); // spilled down
    expect(e.getValue(A(1, 4))).toBe(4); // spilled diagonal
  });

  it('only the anchor is a stored cell; spilled cells are virtual', () => {
    const e = new SheetEngine();
    seedBlock(e);
    e.setContent(A(0, 3), '=A1:B2');
    // 4 literals + 1 anchor formula = 5 stored cells (spilled cells not stored).
    expect(e.size).toBe(5);
  });

  it('spills a single column (vertical array)', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 10);
    e.setContent(A(1, 0), 20);
    e.setContent(A(2, 0), 30);
    e.setContent(A(0, 2), '=A1:A3');
    expect(e.getValue(A(0, 2))).toBe(10);
    expect(e.getValue(A(1, 2))).toBe(20);
    expect(e.getValue(A(2, 2))).toBe(30);
  });

  it('spills a single row (horizontal array)', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 10);
    e.setContent(A(0, 1), 20);
    e.setContent(A(0, 2), 30);
    e.setContent(A(2, 0), '=A1:C1');
    expect(e.getValue(A(2, 0))).toBe(10);
    expect(e.getValue(A(2, 1))).toBe(20);
    expect(e.getValue(A(2, 2))).toBe(30);
  });

  it('a 1×1 array does not spill (scalarized)', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 7);
    e.setContent(A(0, 2), '=A1:A1');
    expect(e.getValue(A(0, 2))).toBe(7);
    // Nothing spilled below.
    expect(e.getValue(A(1, 2))).toBeNull();
  });

  it('an empty array result does not spill (scalarizes to null)', () => {
    const fns = new Map(createDefaultFunctions());
    fns.set('EMPTYARR', () => [] as Matrix);
    const e = new SheetEngine({ functions: fns });
    e.setContent(A(0, 0), '=EMPTYARR()');
    expect(e.getValue(A(0, 0))).toBeNull();
  });

  it('reports the changed spilled keys from setContent', () => {
    const e = new SheetEngine();
    seedBlock(e);
    const changed = e.setContent(A(0, 3), '=A1:B2');
    // anchor + 3 spilled cells.
    expect(changed.has('0,3')).toBe(true);
    expect(changed.has('0,4')).toBe(true);
    expect(changed.has('1,3')).toBe(true);
    expect(changed.has('1,4')).toBe(true);
  });
});

describe('spill — blocking (#SPILL!)', () => {
  it('reports #SPILL! when a target cell holds its own content', () => {
    const e = new SheetEngine();
    seedBlock(e);
    e.setContent(A(1, 4), 'blocker'); // E2 occupied
    e.setContent(A(0, 3), '=A1:B2'); // would spill into E2
    expect(e.getValue(A(0, 3))).toMatchObject({ type: '#SPILL!' });
    // The blocker keeps its value; no spill leaks elsewhere.
    expect(e.getValue(A(1, 4))).toBe('blocker');
    expect(e.getValue(A(0, 4))).toBeNull();
    expect(e.getValue(A(1, 3))).toBeNull();
  });

  it('reports #SPILL! when a later array overlaps an existing one', () => {
    const e = new SheetEngine();
    seedBlock(e);
    e.setContent(A(0, 3), '=A1:B2'); // D1 -> spills D1:E2 (owns 1,3)
    e.setContent(A(1, 2), '=A1:B2'); // C2 -> would spill C2:D3, hitting D2 (1,3)
    expect(e.getValue(A(1, 2))).toMatchObject({ type: '#SPILL!' });
    // The first array is untouched and keeps owning the contested cell.
    expect(e.getValue(A(0, 3))).toBe(1);
    expect(e.getValue(A(1, 3))).toBe(3);
  });

  it('unblocks and re-spills when the blocker is cleared', () => {
    const e = new SheetEngine();
    seedBlock(e);
    e.setContent(A(1, 4), 'blocker');
    e.setContent(A(0, 3), '=A1:B2');
    expect(e.getValue(A(0, 3))).toMatchObject({ type: '#SPILL!' });
    e.setContent(A(1, 4), null); // remove blocker
    expect(e.getValue(A(0, 3))).toBe(1);
    expect(e.getValue(A(1, 4))).toBe(4); // now spilled
  });

  it('blocks when content is written into an already-spilled cell', () => {
    const e = new SheetEngine();
    seedBlock(e);
    e.setContent(A(0, 3), '=A1:B2');
    expect(e.getValue(A(1, 4))).toBe(4);
    // Writing into a spilled cell forces the anchor to #SPILL!.
    e.setContent(A(1, 4), 99);
    expect(e.getValue(A(1, 4))).toBe(99);
    expect(e.getValue(A(0, 3))).toMatchObject({ type: '#SPILL!' });
    // The rest of the spill is withdrawn.
    expect(e.getValue(A(0, 4))).toBeNull();
    expect(e.getValue(A(1, 3))).toBeNull();
  });
});

describe('spill — recalculation & dependents', () => {
  it('re-spills when a source cell changes', () => {
    const e = new SheetEngine();
    seedBlock(e);
    e.setContent(A(0, 3), '=A1:B2');
    expect(e.getValue(A(1, 4))).toBe(4);
    e.setContent(A(1, 1), 400); // B2 = 400
    expect(e.getValue(A(1, 4))).toBe(400);
    expect(e.getValue(A(0, 3))).toBe(1); // anchor unchanged
  });

  it('a formula referencing a spilled cell recomputes when the anchor changes', () => {
    const e = new SheetEngine();
    seedBlock(e);
    e.setContent(A(0, 3), '=A1:B2'); // spills into E2 (1,4) = 4
    e.setContent(A(5, 5), '=E2*10'); // references a spilled cell
    expect(e.getValue(A(5, 5))).toBe(40);
    e.setContent(A(1, 1), 7); // B2 -> 7, so spilled E2 -> 7
    expect(e.getValue(A(5, 5))).toBe(70);
  });

  it('a dependent recomputes when a cell first becomes spilled-into', () => {
    const e = new SheetEngine();
    seedBlock(e);
    // F1 references E2 while it is still empty.
    e.setContent(A(0, 5), '=E2+1');
    expect(e.getValue(A(0, 5))).toBe(1); // empty -> 0, +1
    // Now spill an array whose E2 slot is 4.
    e.setContent(A(0, 3), '=A1:B2');
    expect(e.getValue(A(0, 5))).toBe(5); // E2 became 4, +1
  });

  it('shrinking an array withdraws stale spilled values', () => {
    const e = new SheetEngine();
    seedBlock(e);
    e.setContent(A(0, 3), '=A1:B2'); // 2x2 spill
    expect(e.getValue(A(1, 4))).toBe(4);
    e.setContent(A(0, 3), '=A1:A2'); // now 2x1 — E1/E2 should clear
    expect(e.getValue(A(0, 3))).toBe(1);
    expect(e.getValue(A(1, 3))).toBe(3);
    expect(e.getValue(A(0, 4))).toBeNull();
    expect(e.getValue(A(1, 4))).toBeNull();
  });

  it('replacing the anchor formula with a scalar withdraws the spill', () => {
    const e = new SheetEngine();
    seedBlock(e);
    e.setContent(A(0, 3), '=A1:B2');
    expect(e.getValue(A(1, 4))).toBe(4);
    e.setContent(A(0, 3), 'plain');
    expect(e.getValue(A(0, 3))).toBe('plain');
    expect(e.getValue(A(0, 4))).toBeNull();
    expect(e.getValue(A(1, 4))).toBeNull();
  });

  it('clearing the anchor withdraws the spill', () => {
    const e = new SheetEngine();
    seedBlock(e);
    e.setContent(A(0, 3), '=A1:B2');
    e.setContent(A(0, 3), null);
    expect(e.getValue(A(0, 3))).toBeNull();
    expect(e.getValue(A(1, 4))).toBeNull();
    expect(e.size).toBe(4); // only the 4 seed literals remain
  });
});

describe('spill — interaction with errors & cycles', () => {
  it('a self-referential array anchor is flagged #CYCLE! and does not spill', () => {
    const e = new SheetEngine();
    // The array references its own anchor cell, forming a cycle.
    e.setContent(A(0, 0), '=A1:B2');
    expect(e.getValue(A(0, 0))).toMatchObject({ type: '#CYCLE!' });
    // No spill registered (B1/A2/B2 stay empty or self).
    expect(e.getValue(A(0, 1))).toBeNull();
  });

  it('withdraws a spill when the anchor becomes part of a cycle', () => {
    const e = new SheetEngine();
    seedBlock(e);
    e.setContent(A(0, 3), '=A1:B2'); // D1 spills; E2 (1,4) = 4
    expect(e.getValue(A(1, 4))).toBe(4);
    // Make A1 reference D1; D1's range reads A1 in turn -> A1 ↔ D1 cycle.
    e.setContent(A(0, 0), '=D1');
    expect(e.getValue(A(0, 3))).toMatchObject({ type: '#CYCLE!' });
    expect(e.getValue(A(0, 0))).toMatchObject({ type: '#CYCLE!' });
    // The spill is withdrawn.
    expect(e.getValue(A(1, 4))).toBeNull();
    expect(e.getValue(A(0, 4))).toBeNull();
  });

  it('propagates source errors into the spilled cells', () => {
    const e = new SheetEngine();
    e.setContent(A(0, 0), 1);
    e.setContent(A(1, 0), '=1/0'); // A2 -> #DIV/0!
    e.setContent(A(0, 2), '=A1:A2');
    expect(e.getValue(A(0, 2))).toBe(1);
    const spilled = e.getValue(A(1, 2));
    expect(FormulaError.is(spilled) && spilled.type).toBe('#DIV/0!');
  });
});
