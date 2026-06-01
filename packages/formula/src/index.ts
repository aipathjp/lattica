/** @lattica/formula — clean-room Excel-compatible formula engine. */

export {
  FormulaError,
  ERROR_TYPES,
  errorFromText,
  DIV0,
  VALUE,
  REF,
  NAME,
  NA,
  NUM,
  CYCLE,
  type ErrorType,
} from './errors.js';
export { tokenize, LexError } from './lexer.js';
export type { Token, TokenType } from './tokens.js';
export type * from './ast.js';
export { Parser, parseFormula, ParseError } from './parser.js';
export {
  toNumber,
  toText,
  toBoolean,
  compareScalars,
  isNumeric,
  type CellScalar,
  type FormulaValue,
  type Matrix,
} from './values.js';
export {
  evaluate,
  scalarize,
  type EvalContext,
  type FunctionImpl,
  type FunctionRegistry,
} from './evaluator.js';
export { createDefaultFunctions, builtinFunctionNames } from './functions.js';
export { extractReferences, type ExtractOptions } from './references.js';
export { DependencyGraph, topoSort, type TopoResult } from './dependency-graph.js';
export {
  SheetEngine,
  type SheetEngineOptions,
  type CellContent,
} from './engine.js';
