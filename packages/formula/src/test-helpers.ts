import { parseFormula } from './parser.js';
import { evaluate, type EvalContext } from './evaluator.js';
import { createDefaultFunctions } from './functions.js';
import type { CellScalar, FormulaValue } from './values.js';
import type { FormulaError } from './errors.js';

export interface Harness {
  cells: Record<string, CellScalar | FormulaError>;
  names: Record<string, FormulaValue>;
}

/** Evaluate a formula body against an optional cell map and named values. */
export function evalFormula(
  formula: string,
  cells: Record<string, CellScalar | FormulaError> = {},
  names: Record<string, FormulaValue> = {},
): FormulaValue {
  const ctx: EvalContext = {
    functions: createDefaultFunctions(),
    getCell: (ref) => cells[`${ref.row},${ref.col}`] ?? null,
    getName: (name) => names[name],
  };
  return evaluate(parseFormula(formula), ctx);
}
