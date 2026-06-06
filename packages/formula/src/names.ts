/**
 * NameRegistry — storage for defined names (named ranges and named values).
 *
 * A defined name maps an identifier to a formula expression: a range such as
 * `A1:B3`, an expression such as `=A1*2`, or a bare literal such as `3.14`.
 * The formula body is parsed once at definition time into an {@link AstNode};
 * resolution evaluates that AST on demand so a name can reference cells, ranges,
 * other names, and functions exactly like an in-cell formula.
 *
 * Names are case-insensitive: they are stored and looked up by their
 * upper-cased key, so `Sales`, `sales`, and `SALES` denote the same entry.
 *
 * A formula that fails to parse is recorded as a {@link FormulaError} sentinel
 * so the error propagates to any formula that references the name, mirroring
 * Excel's behaviour for a broken defined name.
 */

import type { AstNode } from './ast.js';
import { parseFormula } from './parser.js';
import { FormulaError } from './errors.js';

/** A parsed defined name: either an evaluable AST or a stored parse error. */
type NameEntry = AstNode | FormulaError;

/** Normalise a defined name to its case-insensitive storage key. */
function normalize(name: string): string {
  return name.toUpperCase();
}

/**
 * Parse a defined-name formula body. A leading `=` is optional and stripped;
 * `parseFormula` only throws `ParseError`/`LexError` (both `Error` subclasses),
 * so a single catch with no instanceof discrimination covers every failure.
 */
function parseEntry(formula: string): NameEntry {
  const body = formula.startsWith('=') ? formula.slice(1) : formula;
  try {
    return parseFormula(body);
  } catch (err) {
    return new FormulaError('#ERROR!', (err as Error).message);
  }
}

export class NameRegistry {
  private readonly entries = new Map<string, NameEntry>();

  /**
   * Define (or redefine) a name with the given formula body. The formula is
   * parsed immediately; a parse failure is stored and surfaced on resolution.
   */
  define(name: string, formula: string): void {
    this.entries.set(normalize(name), parseEntry(formula));
  }

  /** Remove a name. Returns true if it existed, false otherwise. */
  remove(name: string): boolean {
    return this.entries.delete(normalize(name));
  }

  /** All defined names, by their normalised (upper-cased) key. */
  list(): string[] {
    return [...this.entries.keys()];
  }

  /**
   * Look up the parsed entry for a name, or undefined when it is not defined.
   * The caller evaluates the returned AST (or propagates the stored error).
   */
  lookup(name: string): NameEntry | undefined {
    return this.entries.get(normalize(name));
  }
}
