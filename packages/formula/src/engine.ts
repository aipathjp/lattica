/**
 * SheetEngine — the public facade tying parsing, evaluation, and the dependency
 * graph together into an incrementally-recalculating spreadsheet.
 *
 * `setContent(addr, raw)` accepts a literal or a `=formula` string. The engine
 * parses formulas, registers their precedents, and recomputes exactly the set
 * of cells transitively affected by the change — in topological order — marking
 * any cell caught in a circular reference as `#CYCLE!`.
 */

import { addressKey, type CellAddress } from '@lattica/core';
import type { AstNode } from './ast.js';
import { parseFormula } from './parser.js';
import { evaluate, type EvalContext, type FunctionRegistry } from './evaluator.js';
import { createDefaultFunctions } from './functions.js';
import { extractReferences } from './references.js';
import { DependencyGraph, topoSort } from './dependency-graph.js';
import { FormulaError, CYCLE } from './errors.js';
import type { CellScalar, FormulaValue } from './values.js';
import { scalarize } from './evaluator.js';

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
  /** Last computed value. */
  value: CellScalar | FormulaError;
}

export interface SheetEngineOptions {
  functions?: FunctionRegistry;
  maxRangeCells?: number;
}

export class SheetEngine {
  private readonly cells = new Map<string, CellEntry>();
  private readonly graph = new DependencyGraph();
  private readonly functions: FunctionRegistry;
  private readonly maxRangeCells: number;
  private readonly evalContext: EvalContext;

  constructor(options: SheetEngineOptions = {}) {
    this.functions = options.functions ?? createDefaultFunctions();
    this.maxRangeCells = options.maxRangeCells ?? 1_000_000;
    this.evalContext = {
      functions: this.functions,
      getCell: (ref) => this.getValue({ row: ref.row, col: ref.col }),
    };
  }

  /**
   * Set a cell's content. A string beginning with `=` is treated as a formula.
   * Returns the set of cell keys whose value changed (including this one).
   */
  setContent(address: CellAddress, raw: CellContent): Set<string> {
    const key = addressKey(address);
    const isFormula = typeof raw === 'string' && raw.startsWith('=') && raw.length > 1;

    if (isFormula) {
      const body = raw.slice(1);
      const parsed = tryParse(body);
      if (FormulaError.is(parsed)) {
        // Store the parse error as the cell value.
        this.cells.set(key, { literal: null, formula: null, source: body, value: parsed });
        this.graph.clear(key);
        return this.recompute([key]);
      }
      this.cells.set(key, { literal: null, formula: parsed, source: body, value: null });
      const refs = extractReferences(parsed, { maxRangeCells: this.maxRangeCells });
      this.graph.setPrecedents(key, refs);
    } else {
      if (raw === null) {
        this.cells.delete(key);
      } else {
        this.cells.set(key, { literal: raw, formula: null, source: null, value: raw });
      }
      this.graph.clear(key);
    }

    return this.recompute([key]);
  }

  /** Read the current computed value of a cell. */
  getValue(address: CellAddress): CellScalar | FormulaError {
    return this.cells.get(addressKey(address))?.value ?? null;
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
    const parsed = tryParse(trimmed);
    return FormulaError.is(parsed) ? parsed : evaluate(parsed, this.evalContext);
  }

  /**
   * Recompute the cells affected by changes to `seeds`, returning the keys
   * whose value actually changed.
   */
  private recompute(seeds: string[]): Set<string> {
    const affected = this.graph.collectAffected(seeds);
    // Only formula cells need evaluation; literal cells already have a value.
    const formulaCells = [...affected].filter((k) => (this.cells.get(k)?.formula ?? null) !== null);

    const { order, cyclic } = topoSort(formulaCells, (k) => this.graph.getPrecedents(k));

    const changed = new Set<string>();

    // Seeds that are literal/cleared cells: their value already set; record change.
    for (const seed of seeds) {
      changed.add(seed);
    }

    for (const key of order) {
      if (this.evaluateCell(key)) {
        changed.add(key);
      }
    }
    for (const key of cyclic) {
      const entry = this.cells.get(key);
      if (entry !== undefined && !(FormulaError.is(entry.value) && entry.value.type === '#CYCLE!')) {
        entry.value = CYCLE;
        changed.add(key);
      }
    }
    return changed;
  }

  /** Evaluate one formula cell; returns true if its value changed. */
  private evaluateCell(key: string): boolean {
    const entry = this.cells.get(key);
    /* v8 ignore next 3 -- defensive: `order` only ever contains formula cells */
    if (entry === undefined || entry.formula === null) {
      return false;
    }
    const result = scalarize(evaluate(entry.formula, this.evalContext));
    const previous = entry.value;
    if (valuesEqual(previous, result)) {
      return false;
    }
    entry.value = result;
    return true;
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
