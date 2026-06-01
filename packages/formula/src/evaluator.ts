/**
 * Evaluator — walks an {@link AstNode} and produces a {@link FormulaValue}.
 *
 * Errors propagate like Excel: any error operand makes the whole expression
 * that error. Functions are looked up in a {@link FunctionRegistry} and receive
 * their argument AST nodes plus a re-entrant `evaluate` callback, enabling lazy
 * functions such as `IF` and `IFERROR`.
 */

import type { A1Reference } from '@lattica/core';
import type { AstNode } from './ast.js';
import { FormulaError, DIV0, NAME, NUM, VALUE } from './errors.js';
import {
  compareScalars,
  toNumber,
  toText,
  type CellScalar,
  type FormulaValue,
  type Matrix,
} from './values.js';

export type FunctionImpl = (
  args: readonly AstNode[],
  evaluate: (node: AstNode) => FormulaValue,
  ctx: EvalContext,
) => FormulaValue;

export type FunctionRegistry = ReadonlyMap<string, FunctionImpl>;

export interface EvalContext {
  /** Resolve a single cell reference to its current value. */
  getCell(ref: A1Reference): CellScalar | FormulaError;
  /** Resolve a named range / defined name, if supported. */
  getName?(name: string): FormulaValue | undefined;
  readonly functions: FunctionRegistry;
}

/** Reduce any FormulaValue to a single scalar (top-left for arrays). */
export function scalarize(value: FormulaValue): CellScalar | FormulaError {
  if (Array.isArray(value)) {
    const first = value[0]?.[0];
    return first === undefined ? null : first;
  }
  return value;
}

export function evaluate(node: AstNode, ctx: EvalContext): FormulaValue {
  switch (node.kind) {
    case 'number':
      return node.value;
    case 'string':
      return node.value;
    case 'boolean':
      return node.value;
    case 'error':
      return new FormulaError(toErrorType(node.value));
    case 'reference':
      return ctx.getCell(node.ref);
    case 'range':
      return resolveRange(node.start, node.end, ctx);
    case 'name': {
      const resolved = ctx.getName?.(node.name);
      return resolved === undefined ? NAME : resolved;
    }
    case 'unary':
      return evalUnary(node.op, node.operand, ctx);
    case 'binary':
      return evalBinary(node.op, node.left, node.right, ctx);
    case 'call':
      return evalCall(node.name, node.args, ctx);
  }
}

function toErrorType(text: string): import('./errors.js').ErrorType {
  // The lexer already validated the shape; fall back to #ERROR! if unknown.
  switch (text) {
    case '#DIV/0!':
    case '#VALUE!':
    case '#REF!':
    case '#NAME?':
    case '#N/A':
    case '#NUM!':
    case '#CYCLE!':
      return text;
    default:
      return '#ERROR!';
  }
}

function resolveRange(start: A1Reference, end: A1Reference, ctx: EvalContext): Matrix {
  const top = Math.min(start.row, end.row);
  const bottom = Math.max(start.row, end.row);
  const left = Math.min(start.col, end.col);
  const right = Math.max(start.col, end.col);
  const grid: Matrix = [];
  for (let row = top; row <= bottom; row++) {
    const line: (CellScalar | FormulaError)[] = [];
    for (let col = left; col <= right; col++) {
      line.push(ctx.getCell({ row, col, colAbsolute: false, rowAbsolute: false }));
    }
    grid.push(line);
  }
  return grid;
}

function evalUnary(op: '-' | '+' | '%', operandNode: AstNode, ctx: EvalContext): FormulaValue {
  const operand = scalarize(evaluate(operandNode, ctx));
  const num = toNumber(operand);
  if (FormulaError.is(num)) {
    return num;
  }
  switch (op) {
    case '-':
      return -num;
    case '+':
      return num;
    case '%':
      return num / 100;
  }
}

const COMPARATORS: Record<string, (c: number) => boolean> = {
  '=': (c) => c === 0,
  '<>': (c) => c !== 0,
  '<': (c) => c < 0,
  '>': (c) => c > 0,
  '<=': (c) => c <= 0,
  '>=': (c) => c >= 0,
};

function evalBinary(op: string, leftNode: AstNode, rightNode: AstNode, ctx: EvalContext): FormulaValue {
  const left = scalarize(evaluate(leftNode, ctx));
  if (FormulaError.is(left)) {
    return left;
  }
  const right = scalarize(evaluate(rightNode, ctx));
  if (FormulaError.is(right)) {
    return right;
  }

  if (op === '&') {
    return toText(left) + toText(right);
  }

  const comparator = COMPARATORS[op];
  if (comparator !== undefined) {
    return comparator(compareScalars(left, right));
  }

  // Arithmetic.
  const a = toNumber(left);
  if (FormulaError.is(a)) {
    return a;
  }
  const b = toNumber(right);
  if (FormulaError.is(b)) {
    return b;
  }
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      return b === 0 ? DIV0 : a / b;
    case '^': {
      const result = Math.pow(a, b);
      return Number.isFinite(result) ? result : NUM;
    }
    /* v8 ignore next 2 -- op is constrained to the arithmetic set by the parser */
    default:
      return VALUE;
  }
}

function evalCall(name: string, args: readonly AstNode[], ctx: EvalContext): FormulaValue {
  const impl = ctx.functions.get(name);
  if (impl === undefined) {
    return NAME;
  }
  return impl(args, (node) => evaluate(node, ctx), ctx);
}
