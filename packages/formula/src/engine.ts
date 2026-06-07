/**
 * SheetEngine — the public facade tying parsing, evaluation, and the dependency
 * graph together into an incrementally-recalculating spreadsheet.
 *
 * `setContent(addr, raw)` accepts a literal or a `=formula` string. The engine
 * parses formulas, registers their precedents, and recomputes exactly the set
 * of cells transitively affected by the change — in topological order — marking
 * any cell caught in a circular reference as `#CYCLE!`.
 *
 * ## Dynamic arrays (spill)
 *
 * When a formula evaluates to a multi-cell array (a {@link Matrix} larger than
 * 1×1) the anchor cell displays the top-left value and the remaining values
 * "spill" into the adjacent cells below/right. Spilled cells are not real
 * entries; reads resolve them through a {@link spillMap} pointing back at the
 * owning anchor. If any spill target already holds its own content, the anchor
 * instead reports `#SPILL!` and nothing spills. Spilled cells depend on their
 * anchor in the dependency graph, so formulas referencing a spilled cell
 * recalculate when the anchor's array changes.
 */

import { addressKey, toA1, type CellAddress } from '@lattica/core';
import type { AstNode } from './ast.js';
import { parseFormula } from './parser.js';
import { expandStructuredRefs } from './structured-refs.js';
import { evaluate, type EvalContext, type FunctionRegistry } from './evaluator.js';
import { createDefaultFunctions } from './functions.js';
import { extractReferences } from './references.js';
import { DependencyGraph, topoSort } from './dependency-graph.js';
import { FormulaError, CYCLE, SPILL } from './errors.js';
import type { CellScalar, FormulaValue, Matrix } from './values.js';
import { scalarize } from './evaluator.js';
import { NameRegistry } from './names.js';

export type CellContent = CellScalar;

/**
 * Parse a formula body, returning the AST or a `#ERROR!` value. `parseFormula`
 * only throws `ParseError`/`LexError` (both `Error` subclasses), so a single
 * catch with no instanceof discrimination covers every failure.
 */
function tryParse(body: string): AstNode | FormulaError {
  try {
    return parseFormula(body);
  } catch (err) {
    return new FormulaError('#ERROR!', (err as Error).message);
  }
}

interface CellEntry {
  /** The literal value, or null when the cell holds a formula. */
  literal: CellScalar;
  /** Parsed formula AST, or null for literal cells. */
  formula: AstNode | null;
  /** Original formula source (without `=`), for round-tripping. */
  source: string | null;
  /** Last computed value (the anchor/top-left value for a spilling array). */
  value: CellScalar | FormulaError;
  /** The spilled array when this cell anchors a multi-cell result, else null. */
  spill: Matrix | null;
  /** Keys this cell currently spills into (excludes the anchor itself). */
  spillKeys: string[];
}

/** Where a spilled (non-anchor) cell gets its value from. */
interface SpillTarget {
  /** Key of the anchor cell whose array produced this value. */
  anchor: string;
  /** Row offset within the anchor's array. */
  r: number;
  /** Column offset within the anchor's array. */
  c: number;
}

export interface SheetEngineOptions {
  functions?: FunctionRegistry;
  maxRangeCells?: number;
}

/** A named table for structured references: data top-left + column headers. */
export interface TableDef {
  /** Row of the first data cell (header row excluded). */
  row: number;
  /** Column of the first data cell. */
  col: number;
  /** Number of data rows. */
  rowCount: number;
  /** Column headers in left-to-right order. */
  headers: string[];
}

/** Parse a `"row,col"` cell key back into numeric coordinates. */
function parseKey(key: string): { row: number; col: number } {
  const comma = key.indexOf(',');
  return { row: Number(key.slice(0, comma)), col: Number(key.slice(comma + 1)) };
}

/** Is `value` a multi-cell array (larger than a single 1×1 matrix)? */
function isSpillingArray(value: FormulaValue): value is Matrix {
  return Array.isArray(value) && (value.length > 1 || (value[0]?.length ?? 0) > 1);
}

export class SheetEngine {
  private readonly cells = new Map<string, CellEntry>();
  private readonly graph = new DependencyGraph();
  private readonly functions: FunctionRegistry;
  private readonly maxRangeCells: number;
  private readonly names = new NameRegistry();
  private readonly evalContext: EvalContext;
  /** Maps each spilled (non-anchor) cell key to its source array slot. */
  private readonly spillMap = new Map<string, SpillTarget>();
  /** Named tables for structured references, keyed by upper-cased name. */
  private readonly tables = new Map<string, TableDef>();

  constructor(options: SheetEngineOptions = {}) {
    this.functions = options.functions ?? createDefaultFunctions();
    this.maxRangeCells = options.maxRangeCells ?? 1_000_000;
    this.evalContext = {
      functions: this.functions,
      getCell: (ref) => this.getValue({ row: ref.row, col: ref.col }),
      getName: (name) => this.resolveName(name),
    };
  }

  /**
   * Define (or redefine) a named range / named value. The formula body may be a
   * range (`A1:B3`), an expression (`=A1*2`), or a bare literal (`3.14`). Names
   * are case-insensitive. A formula that fails to parse is surfaced as an error
   * when the name is referenced.
   */
  defineName(name: string, formula: string): void {
    this.names.define(name, formula);
  }

  /** Remove a defined name. Returns true if it existed, false otherwise. */
  removeName(name: string): boolean {
    return this.names.remove(name);
  }

  /** List all defined names, normalised to upper case. */
  getNames(): string[] {
    return this.names.list();
  }

  /** Define (or replace) a table for `Table[Column]` structured references. */
  defineTable(name: string, def: TableDef): void {
    this.tables.set(name.toUpperCase(), { ...def, headers: [...def.headers] });
  }

  /** Remove a defined table. Returns true if it existed. */
  removeTable(name: string): boolean {
    return this.tables.delete(name.toUpperCase());
  }

  /** List defined table names (upper-cased). */
  getTables(): string[] {
    return [...this.tables.keys()];
  }

  /** Resolve `Table[Column]` to an A1 range string, or null when unknown. */
  private resolveTableRange(table: string, column: string): string | null {
    const def = this.tables.get(table.toUpperCase());
    if (def === undefined) {
      return null;
    }
    const ci = def.headers.findIndex((h) => h.toLowerCase() === column.toLowerCase());
    if (ci === -1 || def.rowCount <= 0) {
      return null;
    }
    const col = def.col + ci;
    const top = toA1({ row: def.row, col });
    const bottom = toA1({ row: def.row + def.rowCount - 1, col });
    return `${top}:${bottom}`;
  }

  /** Expand any structured references in a formula body to A1 ranges. */
  private expand(body: string): string {
    return expandStructuredRefs(body, (t, c) => this.resolveTableRange(t, c));
  }

  /**
   * Resolve a defined name to a {@link FormulaValue} by evaluating its stored
   * formula in this engine's context. Ranges yield a {@link Matrix},
   * expressions yield a scalar, and a stored parse error propagates. Returns
   * undefined for an unknown name so the evaluator emits `#NAME?`.
   */
  private resolveName(name: string): FormulaValue | undefined {
    const entry = this.names.lookup(name);
    if (entry === undefined) {
      return undefined;
    }
    if (FormulaError.is(entry)) {
      return entry;
    }
    return evaluate(entry, this.evalContext);
  }

  /**
   * Set a cell's content. A string beginning with `=` is treated as a formula.
   * Returns the set of cell keys whose value changed (including this one).
   */
  setContent(address: CellAddress, raw: CellContent): Set<string> {
    const key = addressKey(address);
    const isFormula = typeof raw === 'string' && raw.startsWith('=') && raw.length > 1;

    // Writing real content into a cell removes any previous formula's spill.
    const existing = this.cells.get(key);
    if (existing !== undefined) {
      this.clearSpill(existing);
    }

    if (isFormula) {
      const body = raw.slice(1);
      // Structured refs (Table[Col]) expand to A1 ranges before parsing; the
      // original body is kept as `source` for round-tripping.
      const parsed = tryParse(this.expand(body));
      if (FormulaError.is(parsed)) {
        // Store the parse error as the cell value.
        this.cells.set(key, this.makeEntry({ source: body, value: parsed }));
        this.graph.clear(key);
        return this.recompute([key]);
      }
      this.cells.set(key, this.makeEntry({ formula: parsed, source: body }));
      const refs = extractReferences(parsed, { maxRangeCells: this.maxRangeCells });
      this.graph.setPrecedents(key, refs);
    } else {
      if (raw === null) {
        this.cells.delete(key);
      } else {
        this.cells.set(key, this.makeEntry({ literal: raw, value: raw }));
      }
      this.graph.clear(key);
    }

    return this.recompute([key]);
  }

  /** Build a CellEntry, filling spill bookkeeping defaults. */
  private makeEntry(partial: Partial<CellEntry>): CellEntry {
    return {
      literal: partial.literal ?? null,
      formula: partial.formula ?? null,
      source: partial.source ?? null,
      value: partial.value ?? null,
      spill: null,
      spillKeys: [],
    };
  }

  /** Read the current computed value of a cell (resolving spilled cells). */
  getValue(address: CellAddress): CellScalar | FormulaError {
    const key = addressKey(address);
    const entry = this.cells.get(key);
    if (entry !== undefined) {
      return entry.value;
    }
    const target = this.spillMap.get(key);
    if (target !== undefined) {
      // Invariant: a spillMap entry always points at a live anchor whose
      // `spill` matrix holds the indexed slot (set/cleared in lockstep).
      return this.cells.get(target.anchor)!.spill![target.r]![target.c]!;
    }
    return null;
  }

  /** Read the original input of a cell: `=formula` or its literal. */
  getContent(address: CellAddress): CellContent {
    const entry = this.cells.get(addressKey(address));
    if (entry === undefined) {
      return null;
    }
    if (entry.source !== null) {
      return `=${entry.source}`;
    }
    return entry.literal;
  }

  /** Parse and evaluate a one-off formula without storing it. */
  evaluateFormula(body: string): FormulaValue {
    const trimmed = body.startsWith('=') ? body.slice(1) : body;
    const parsed = tryParse(this.expand(trimmed));
    return FormulaError.is(parsed) ? parsed : evaluate(parsed, this.evalContext);
  }

  /**
   * Remove an anchor's spill registrations (spillMap entries + the anchor→cell
   * graph edges), recording each freed key into `removed` when provided.
   */
  private clearSpill(entry: CellEntry, removed?: Set<string>): void {
    for (const k of entry.spillKeys) {
      this.spillMap.delete(k);
      this.graph.clear(k);
      removed?.add(k);
    }
    entry.spillKeys = [];
    entry.spill = null;
  }

  /**
   * Recompute the cells affected by changes to `seeds`, returning the keys
   * whose value actually changed. The computation iterates to a fixpoint: each
   * round re-seeds with cells whose spill membership changed, so formulas that
   * reference a cell which only just became (or stopped being) spilled-into are
   * picked up. A guard bounds the loop against pathological cascades.
   */
  private recompute(seeds: string[]): Set<string> {
    const changed = new Set<string>();
    let frontier = seeds;
    let guard = 0;
    const maxRounds = this.cells.size + seeds.length + 2;
    while (frontier.length > 0 && guard <= maxRounds) {
      guard++;
      frontier = this.recomputeRound(frontier, changed);
    }
    return changed;
  }

  /**
   * One recompute pass. Evaluates all affected formula cells in topological
   * order and returns the spilled-cell keys whose membership or value changed
   * (the seeds for the next round).
   */
  private recomputeRound(seeds: string[], changed: Set<string>): string[] {
    // A write to a spilled cell must re-run its anchor to detect (un)blocking.
    const expanded = new Set<string>(seeds);
    for (const s of seeds) {
      const target = this.spillMap.get(s);
      if (target !== undefined) {
        expanded.add(target.anchor);
      }
    }

    const affected = this.graph.collectAffected(expanded);
    // Order formula cells; spilled-cell placeholders are included so a
    // dependent of a spilled cell is sequenced after that cell's anchor.
    const nodes = [...affected].filter(
      (k) => (this.cells.get(k)?.formula ?? null) !== null || this.spillMap.has(k),
    );
    const { order, cyclic } = topoSort(nodes, (k) => this.graph.getPrecedents(k));

    for (const seed of seeds) {
      changed.add(seed);
    }

    const spillDelta: string[] = [];
    for (const key of order) {
      this.evaluateCell(key, changed, spillDelta);
    }
    for (const key of cyclic) {
      const entry = this.cells.get(key);
      if (entry !== undefined && !(FormulaError.is(entry.value) && entry.value.type === '#CYCLE!')) {
        this.clearSpill(entry, changed);
        entry.value = CYCLE;
        changed.add(key);
      }
    }
    return spillDelta;
  }

  /**
   * Evaluate one formula cell, applying or clearing its spill and recording
   * value changes into `changed` and spill-membership changes into `spillDelta`.
   * Non-formula keys (literal cells and spilled placeholders) are skipped.
   */
  private evaluateCell(key: string, changed: Set<string>, spillDelta: string[]): void {
    const entry = this.cells.get(key);
    if (entry === undefined || entry.formula === null) {
      return;
    }

    // Reset to the formula's pure precedents, dropping any watch edges added by
    // a prior blocked spill so a successful re-spill cannot form a false cycle
    // with its own (target → anchor) edges.
    const refs = extractReferences(entry.formula, { maxRangeCells: this.maxRangeCells });
    this.graph.setPrecedents(key, refs);

    const raw = evaluate(entry.formula, this.evalContext);

    // Snapshot the previous spill so we can diff membership and values. A
    // non-empty spillKeys list implies entry.spill is the matrix it indexes.
    const oldKeys = new Set(entry.spillKeys);
    const oldValues = new Map<string, CellScalar | FormulaError>();
    for (const k of entry.spillKeys) {
      const t = this.spillMap.get(k)!;
      oldValues.set(k, entry.spill![t.r]![t.c]!);
    }

    this.clearSpill(entry);

    const newValue = isSpillingArray(raw) ? this.applySpill(key, entry, raw, refs) : scalarize(raw);
    const previous = entry.value;
    entry.value = newValue;
    if (!valuesEqual(previous, newValue)) {
      changed.add(key);
    }

    // Diff the spill region: removals, additions, and value changes all need
    // their dependents revisited on the next round.
    const newKeys = new Set(entry.spillKeys);
    for (const k of oldKeys) {
      if (!newKeys.has(k)) {
        changed.add(k);
        spillDelta.push(k);
      }
    }
    for (const k of newKeys) {
      const t = this.spillMap.get(k)!;
      const current = entry.spill![t.r]![t.c]!;
      if (!oldKeys.has(k)) {
        changed.add(k);
        spillDelta.push(k);
      } else if (!valuesEqual(oldValues.get(k)!, current)) {
        changed.add(k);
        spillDelta.push(k);
      }
    }
  }

  /**
   * Spill `matrix` from the anchor at `key`. Returns the top-left value on
   * success, or `#SPILL!` (leaving `entry.spill` null) when any target cell is
   * already occupied by its own content or another anchor's spill. On a block,
   * the anchor is made to depend on the obstructed region (in addition to its
   * formula `refs`) so that clearing the obstruction re-triggers the spill.
   */
  private applySpill(
    key: string,
    entry: CellEntry,
    matrix: Matrix,
    refs: Iterable<string>,
  ): CellScalar | FormulaError {
    const { row, col } = parseKey(key);
    const rows = matrix.length;
    // isSpillingArray guarantees a non-empty first row.
    const cols = matrix[0]!.length;

    // Enumerate the intended target region (everything but the anchor itself).
    const region: { key: string; r: number; c: number }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r === 0 && c === 0) {
          continue;
        }
        region.push({ key: `${row + r},${col + c}`, r, c });
      }
    }

    // Blockage: any target already holding its own content or owned by another
    // anchor's spill. Own old spill was cleared, so it does not self-block.
    const blocked = region.some(({ key: tkey }) => {
      const owner = this.spillMap.get(tkey);
      return this.cells.has(tkey) || (owner !== undefined && owner.anchor !== key);
    });
    if (blocked) {
      // Watch the whole intended region so clearing the obstruction re-spills.
      this.graph.setPrecedents(key, [...refs, ...region.map((t) => t.key)]);
      return SPILL;
    }

    // Register the spill: each target reads from (depends on) the anchor.
    entry.spill = matrix;
    for (const { key: tkey, r, c } of region) {
      this.spillMap.set(tkey, { anchor: key, r, c });
      this.graph.setPrecedents(tkey, [key]);
      entry.spillKeys.push(tkey);
    }

    // Anchor displays the top-left value (defined whenever the array spills).
    return matrix[0]![0]!;
  }

  /** Number of stored (non-empty) cells. */
  get size(): number {
    return this.cells.size;
  }
}

function valuesEqual(a: CellScalar | FormulaError, b: CellScalar | FormulaError): boolean {
  if (FormulaError.is(a) || FormulaError.is(b)) {
    return FormulaError.is(a) && FormulaError.is(b) && a.type === b.type;
  }
  return Object.is(a, b);
}
