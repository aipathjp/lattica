/**
 * Built-in function library. Clean-room implementations of common
 * Excel-compatible functions across math, statistics, logical, text, and
 * information categories. Functions receive AST arg nodes plus a re-entrant
 * `evaluate`, so they can be lazy where Excel requires it (IF / IFERROR).
 */

import type { AstNode } from './ast.js';
import type { EvalContext, FunctionImpl, FunctionRegistry } from './evaluator.js';
import { scalarize } from './evaluator.js';
import { FormulaError, DIV0, NA, NUM, REF, VALUE } from './errors.js';
import {
  compareScalars,
  toBoolean,
  toNumber,
  toText,
  type CellScalar,
  type FormulaValue,
  type Matrix,
} from './values.js';

type Evaluate = (node: AstNode) => FormulaValue;

interface FlatValue {
  readonly value: CellScalar | FormulaError;
  readonly fromRange: boolean;
}

/** Yield every scalar produced by the args, expanding ranges. */
function* iterateValues(args: readonly AstNode[], evaluate: Evaluate): Generator<FlatValue> {
  for (const arg of args) {
    const value = evaluate(arg);
    if (Array.isArray(value)) {
      for (const row of value) {
        for (const cell of row) {
          yield { value: cell, fromRange: true };
        }
      }
    } else {
      yield { value, fromRange: false };
    }
  }
}

/**
 * Collect numbers for aggregation. Range text/blanks are skipped (Excel
 * behavior); direct string args are coerced and error on failure; errors
 * propagate.
 */
function collectNumbers(args: readonly AstNode[], evaluate: Evaluate): number[] | FormulaError {
  const out: number[] = [];
  for (const { value, fromRange } of iterateValues(args, evaluate)) {
    if (FormulaError.is(value)) {
      return value;
    }
    if (typeof value === 'number') {
      out.push(value);
    } else if (typeof value === 'boolean') {
      if (!fromRange) {
        out.push(value ? 1 : 0);
      }
    } else if (value === null) {
      // skip blanks
    } else {
      // string
      if (!fromRange) {
        const n = toNumber(value);
        if (FormulaError.is(n)) {
          return n;
        }
        out.push(n);
      }
    }
  }
  return out;
}

function argNumber(node: AstNode | undefined, evaluate: Evaluate): number | FormulaError {
  /* v8 ignore next 3 -- callers guard arity before reading required numeric args */
  if (node === undefined) {
    return VALUE;
  }
  return toNumber(scalarize(evaluate(node)));
}

function argText(node: AstNode | undefined, evaluate: Evaluate): string | FormulaError {
  if (node === undefined) {
    return '';
  }
  const v = scalarize(evaluate(node));
  if (FormulaError.is(v)) {
    return v;
  }
  return toText(v);
}

function expectArgs(args: readonly AstNode[], min: number, max = min): FormulaError | null {
  if (args.length < min || args.length > max) {
    return VALUE;
  }
  return null;
}

/** Wrap a 1-number → number function with error propagation. */
function unaryMath(fn: (x: number) => number | FormulaError): FunctionImpl {
  return (args, evaluate) => {
    const err = expectArgs(args, 1);
    if (err) return err;
    const x = argNumber(args[0], evaluate);
    if (FormulaError.is(x)) return x;
    return fn(x);
  };
}

const registry = new Map<string, FunctionImpl>();
const def = (name: string, impl: FunctionImpl) => registry.set(name, impl);

// ── Math ────────────────────────────────────────────────────────────────────
def('SUM', (args, evaluate) => {
  const nums = collectNumbers(args, evaluate);
  if (FormulaError.is(nums)) return nums;
  return nums.reduce((a, b) => a + b, 0);
});

def('PRODUCT', (args, evaluate) => {
  const nums = collectNumbers(args, evaluate);
  if (FormulaError.is(nums)) return nums;
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a * b, 1);
});

def('ABS', unaryMath((x) => Math.abs(x)));
def('SQRT', unaryMath((x) => (x < 0 ? NUM : Math.sqrt(x))));
def('EXP', unaryMath((x) => Math.exp(x)));
def('LN', unaryMath((x) => (x <= 0 ? NUM : Math.log(x))));
def('LOG10', unaryMath((x) => (x <= 0 ? NUM : Math.log10(x))));
def('INT', unaryMath((x) => Math.floor(x)));
def('SIGN', unaryMath((x) => Math.sign(x)));

def('LOG', (args, evaluate) => {
  const err = expectArgs(args, 1, 2);
  if (err) return err;
  const x = argNumber(args[0], evaluate);
  if (FormulaError.is(x)) return x;
  const base = args.length === 2 ? argNumber(args[1], evaluate) : 10;
  if (FormulaError.is(base)) return base;
  if (x <= 0 || base <= 0 || base === 1) return NUM;
  return Math.log(x) / Math.log(base);
});

def('POWER', (args, evaluate) => {
  const err = expectArgs(args, 2);
  if (err) return err;
  const base = argNumber(args[0], evaluate);
  if (FormulaError.is(base)) return base;
  const exp = argNumber(args[1], evaluate);
  if (FormulaError.is(exp)) return exp;
  const result = Math.pow(base, exp);
  return Number.isFinite(result) ? result : NUM;
});

def('MOD', (args, evaluate) => {
  const err = expectArgs(args, 2);
  if (err) return err;
  const a = argNumber(args[0], evaluate);
  if (FormulaError.is(a)) return a;
  const b = argNumber(args[1], evaluate);
  if (FormulaError.is(b)) return b;
  if (b === 0) return DIV0;
  // Excel MOD result takes the sign of the divisor.
  return a - b * Math.floor(a / b);
});

function roundTo(x: number, digits: number, mode: 'round' | 'up' | 'down'): number {
  const factor = Math.pow(10, digits);
  const scaled = x * factor;
  let r: number;
  if (mode === 'up') {
    r = scaled >= 0 ? Math.ceil(scaled) : Math.floor(scaled);
  } else if (mode === 'down') {
    r = scaled >= 0 ? Math.floor(scaled) : Math.ceil(scaled);
  } else {
    r = Math.sign(scaled) * Math.round(Math.abs(scaled));
  }
  return r / factor;
}

function roundImpl(mode: 'round' | 'up' | 'down'): FunctionImpl {
  return (args, evaluate) => {
    const err = expectArgs(args, 1, 2);
    if (err) return err;
    const x = argNumber(args[0], evaluate);
    if (FormulaError.is(x)) return x;
    const digits = args.length === 2 ? argNumber(args[1], evaluate) : 0;
    if (FormulaError.is(digits)) return digits;
    return roundTo(x, Math.trunc(digits), mode);
  };
}
def('ROUND', roundImpl('round'));
def('ROUNDUP', roundImpl('up'));
def('ROUNDDOWN', roundImpl('down'));

def('CEILING', (args, evaluate) => {
  const err = expectArgs(args, 1, 2);
  if (err) return err;
  const x = argNumber(args[0], evaluate);
  if (FormulaError.is(x)) return x;
  const sig = args.length === 2 ? argNumber(args[1], evaluate) : 1;
  if (FormulaError.is(sig)) return sig;
  if (sig === 0) return 0;
  return Math.ceil(x / sig) * sig;
});

def('FLOOR', (args, evaluate) => {
  const err = expectArgs(args, 1, 2);
  if (err) return err;
  const x = argNumber(args[0], evaluate);
  if (FormulaError.is(x)) return x;
  const sig = args.length === 2 ? argNumber(args[1], evaluate) : 1;
  if (FormulaError.is(sig)) return sig;
  if (sig === 0) return DIV0;
  return Math.floor(x / sig) * sig;
});

def('TRUNC', (args, evaluate) => {
  const err = expectArgs(args, 1, 2);
  if (err) return err;
  const x = argNumber(args[0], evaluate);
  if (FormulaError.is(x)) return x;
  const digits = args.length === 2 ? argNumber(args[1], evaluate) : 0;
  if (FormulaError.is(digits)) return digits;
  return roundTo(x, Math.trunc(digits), 'down');
});

// ── Statistics ────────────────────────────────────────────────────────────
def('AVERAGE', (args, evaluate) => {
  const nums = collectNumbers(args, evaluate);
  if (FormulaError.is(nums)) return nums;
  if (nums.length === 0) return DIV0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
});

def('MIN', (args, evaluate) => {
  const nums = collectNumbers(args, evaluate);
  if (FormulaError.is(nums)) return nums;
  return nums.length === 0 ? 0 : Math.min(...nums);
});

def('MAX', (args, evaluate) => {
  const nums = collectNumbers(args, evaluate);
  if (FormulaError.is(nums)) return nums;
  return nums.length === 0 ? 0 : Math.max(...nums);
});

def('MEDIAN', (args, evaluate) => {
  const nums = collectNumbers(args, evaluate);
  if (FormulaError.is(nums)) return nums;
  if (nums.length === 0) return NUM;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
});

def('COUNT', (args, evaluate) => {
  let count = 0;
  for (const { value } of iterateValues(args, evaluate)) {
    if (typeof value === 'number') count++;
  }
  return count;
});

def('COUNTA', (args, evaluate) => {
  let count = 0;
  for (const { value } of iterateValues(args, evaluate)) {
    if (value !== null && !(typeof value === 'string' && value === '')) count++;
  }
  return count;
});

def('COUNTBLANK', (args, evaluate) => {
  let count = 0;
  for (const { value } of iterateValues(args, evaluate)) {
    if (value === null || (typeof value === 'string' && value === '')) count++;
  }
  return count;
});

// ── Logical (lazy where needed) ─────────────────────────────────────────────
def('IF', (args, evaluate) => {
  const err = expectArgs(args, 2, 3);
  if (err) return err;
  const cond = toBoolean(scalarize(evaluate(args[0]!)));
  if (FormulaError.is(cond)) return cond;
  if (cond) return evaluate(args[1]!);
  return args.length === 3 ? evaluate(args[2]!) : false;
});

def('IFERROR', (args, evaluate) => {
  const err = expectArgs(args, 2);
  if (err) return err;
  const value = evaluate(args[0]!);
  if (FormulaError.is(scalarize(value))) {
    return evaluate(args[1]!);
  }
  return value;
});

def('IFNA', (args, evaluate) => {
  const err = expectArgs(args, 2);
  if (err) return err;
  const value = evaluate(args[0]!);
  const s = scalarize(value);
  if (FormulaError.is(s) && s.type === '#N/A') {
    return evaluate(args[1]!);
  }
  return value;
});

function boolReduce(
  args: readonly AstNode[],
  evaluate: Evaluate,
  reducer: (acc: boolean, v: boolean) => boolean,
  initial: boolean,
): FormulaValue {
  if (args.length === 0) return VALUE;
  let acc = initial;
  let seen = false;
  for (const { value } of iterateValues(args, evaluate)) {
    if (FormulaError.is(value)) return value;
    if (value === null) continue;
    const b = toBoolean(value);
    if (FormulaError.is(b)) return b;
    acc = reducer(acc, b);
    seen = true;
  }
  return seen ? acc : VALUE;
}

def('AND', (args, evaluate) => boolReduce(args, evaluate, (a, b) => a && b, true));
def('OR', (args, evaluate) => boolReduce(args, evaluate, (a, b) => a || b, false));
def('XOR', (args, evaluate) => {
  if (args.length === 0) return VALUE;
  let count = 0;
  let seen = false;
  for (const { value } of iterateValues(args, evaluate)) {
    if (FormulaError.is(value)) return value;
    if (value === null) continue;
    const b = toBoolean(value);
    if (FormulaError.is(b)) return b;
    if (b) count++;
    seen = true;
  }
  return seen ? count % 2 === 1 : VALUE;
});

def('NOT', (args, evaluate) => {
  const err = expectArgs(args, 1);
  if (err) return err;
  const b = toBoolean(scalarize(evaluate(args[0]!)));
  if (FormulaError.is(b)) return b;
  return !b;
});

def('TRUE', (args) => (args.length === 0 ? true : VALUE));
def('FALSE', (args) => (args.length === 0 ? false : VALUE));

// ── Text ────────────────────────────────────────────────────────────────────
function concatImpl(args: readonly AstNode[], evaluate: Evaluate): FormulaValue {
  let out = '';
  for (const { value } of iterateValues(args, evaluate)) {
    if (FormulaError.is(value)) return value;
    out += toText(value);
  }
  return out;
}
def('CONCATENATE', concatImpl);
def('CONCAT', concatImpl);

def('LEN', (args, evaluate) => {
  const err = expectArgs(args, 1);
  if (err) return err;
  const t = argText(args[0], evaluate);
  if (FormulaError.is(t)) return t;
  return t.length;
});

def('UPPER', (args, evaluate) => {
  const t = argText(args[0], evaluate);
  return FormulaError.is(t) ? t : t.toUpperCase();
});
def('LOWER', (args, evaluate) => {
  const t = argText(args[0], evaluate);
  return FormulaError.is(t) ? t : t.toLowerCase();
});
def('TRIM', (args, evaluate) => {
  const t = argText(args[0], evaluate);
  return FormulaError.is(t) ? t : t.replace(/\s+/g, ' ').trim();
});

def('PROPER', (args, evaluate) => {
  const t = argText(args[0], evaluate);
  if (FormulaError.is(t)) return t;
  return t.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\B\w/g, (c) => c.toLowerCase());
});

def('LEFT', (args, evaluate) => {
  const err = expectArgs(args, 1, 2);
  if (err) return err;
  const t = argText(args[0], evaluate);
  if (FormulaError.is(t)) return t;
  const n = args.length === 2 ? argNumber(args[1], evaluate) : 1;
  if (FormulaError.is(n)) return n;
  if (n < 0) return VALUE;
  return t.slice(0, Math.trunc(n));
});

def('RIGHT', (args, evaluate) => {
  const err = expectArgs(args, 1, 2);
  if (err) return err;
  const t = argText(args[0], evaluate);
  if (FormulaError.is(t)) return t;
  const n = args.length === 2 ? argNumber(args[1], evaluate) : 1;
  if (FormulaError.is(n)) return n;
  if (n < 0) return VALUE;
  const count = Math.trunc(n);
  return count === 0 ? '' : t.slice(-count);
});

def('MID', (args, evaluate) => {
  const err = expectArgs(args, 3);
  if (err) return err;
  const t = argText(args[0], evaluate);
  if (FormulaError.is(t)) return t;
  const start = argNumber(args[1], evaluate);
  if (FormulaError.is(start)) return start;
  const len = argNumber(args[2], evaluate);
  if (FormulaError.is(len)) return len;
  if (start < 1 || len < 0) return VALUE;
  return t.slice(Math.trunc(start) - 1, Math.trunc(start) - 1 + Math.trunc(len));
});

def('REPT', (args, evaluate) => {
  const err = expectArgs(args, 2);
  if (err) return err;
  const t = argText(args[0], evaluate);
  if (FormulaError.is(t)) return t;
  const n = argNumber(args[1], evaluate);
  if (FormulaError.is(n)) return n;
  if (n < 0) return VALUE;
  return t.repeat(Math.trunc(n));
});

def('FIND', (args, evaluate) => {
  const err = expectArgs(args, 2, 3);
  if (err) return err;
  const needle = argText(args[0], evaluate);
  if (FormulaError.is(needle)) return needle;
  const hay = argText(args[1], evaluate);
  if (FormulaError.is(hay)) return hay;
  const start = args.length === 3 ? argNumber(args[2], evaluate) : 1;
  if (FormulaError.is(start)) return start;
  if (start < 1) return VALUE;
  const idx = hay.indexOf(needle, Math.trunc(start) - 1);
  return idx === -1 ? VALUE : idx + 1;
});

def('SUBSTITUTE', (args, evaluate) => {
  const err = expectArgs(args, 3, 4);
  if (err) return err;
  const text = argText(args[0], evaluate);
  if (FormulaError.is(text)) return text;
  const oldText = argText(args[1], evaluate);
  if (FormulaError.is(oldText)) return oldText;
  const newText = argText(args[2], evaluate);
  if (FormulaError.is(newText)) return newText;
  if (oldText === '') return text;
  if (args.length === 4) {
    const which = argNumber(args[3], evaluate);
    if (FormulaError.is(which)) return which;
    if (which < 1) return VALUE;
    return substituteNth(text, oldText, newText, Math.trunc(which));
  }
  return text.split(oldText).join(newText);
});

function substituteNth(text: string, oldText: string, newText: string, nth: number): string {
  let count = 0;
  let idx = 0;
  for (;;) {
    const found = text.indexOf(oldText, idx);
    if (found === -1) return text;
    count++;
    if (count === nth) {
      return text.slice(0, found) + newText + text.slice(found + oldText.length);
    }
    idx = found + oldText.length;
  }
}

def('TEXTJOIN', (args, evaluate) => {
  if (args.length < 3) return VALUE;
  const delim = argText(args[0], evaluate);
  if (FormulaError.is(delim)) return delim;
  const ignoreEmpty = toBoolean(scalarize(evaluate(args[1]!)));
  if (FormulaError.is(ignoreEmpty)) return ignoreEmpty;
  const parts: string[] = [];
  for (const { value } of iterateValues(args.slice(2), evaluate)) {
    if (FormulaError.is(value)) return value;
    if (ignoreEmpty && (value === null || value === '')) continue;
    parts.push(toText(value));
  }
  return parts.join(delim);
});

def('VALUE', (args, evaluate) => {
  const err = expectArgs(args, 1);
  if (err) return err;
  return argNumber(args[0], evaluate);
});

def('T', (args, evaluate) => {
  const v = scalarize(evaluate(args[0]!));
  if (FormulaError.is(v)) return v;
  return typeof v === 'string' ? v : '';
});

def('N', (args, evaluate) => {
  const v = scalarize(evaluate(args[0]!));
  if (FormulaError.is(v)) return v;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return 0;
});

// ── Information ───────────────────────────────────────────────────────────
function infoPredicate(test: (v: CellScalar | FormulaError) => boolean): FunctionImpl {
  return (args, evaluate) => {
    const err = expectArgs(args, 1);
    if (err) return err;
    return test(scalarize(evaluate(args[0]!)));
  };
}
def('ISBLANK', infoPredicate((v) => v === null));
def('ISNUMBER', infoPredicate((v) => typeof v === 'number'));
def('ISTEXT', infoPredicate((v) => typeof v === 'string'));
def('ISLOGICAL', infoPredicate((v) => typeof v === 'boolean'));
def('ISERROR', infoPredicate((v) => FormulaError.is(v)));
def('ISERR', infoPredicate((v) => FormulaError.is(v) && v.type !== '#N/A'));
def('ISNA', infoPredicate((v) => FormulaError.is(v) && v.type === '#N/A'));

def('NA', (args) => (args.length === 0 ? NA : VALUE));

// ── Conditional aggregation ─────────────────────────────────────────────────
def('SUMIF', (args, evaluate) => sumCountIf(args, evaluate, 'sum'));
def('COUNTIF', (args, evaluate) => sumCountIf(args, evaluate, 'count'));

function sumCountIf(
  args: readonly AstNode[],
  evaluate: Evaluate,
  mode: 'sum' | 'count',
): FormulaValue {
  const min = mode === 'sum' ? 2 : 2;
  if (args.length < min) return VALUE;
  const rangeVal = evaluate(args[0]!);
  if (!Array.isArray(rangeVal)) {
    // Single-cell range still works.
    return sumCountIfArrays([[scalarize(rangeVal)]], args, evaluate, mode);
  }
  return sumCountIfArrays(rangeVal, args, evaluate, mode);
}

function sumCountIfArrays(
  range: (CellScalar | FormulaError)[][],
  args: readonly AstNode[],
  evaluate: Evaluate,
  mode: 'sum' | 'count',
): FormulaValue {
  const criterion = scalarize(evaluate(args[1]!));
  if (FormulaError.is(criterion)) return criterion;
  const predicate = makeCriterion(criterion);

  let sumRange: (CellScalar | FormulaError)[][] | null = null;
  if (mode === 'sum' && args.length >= 3) {
    const sr = evaluate(args[2]!);
    sumRange = Array.isArray(sr) ? sr : [[scalarize(sr)]];
  }

  let acc = 0;
  let count = 0;
  for (let r = 0; r < range.length; r++) {
    const row = range[r]!;
    for (let c = 0; c < row.length; c++) {
      const cell = row[c]!;
      if (FormulaError.is(cell)) continue;
      if (!predicate(cell)) continue;
      count++;
      if (mode === 'sum') {
        const target = sumRange ? sumRange[r]?.[c] ?? null : cell;
        if (!FormulaError.is(target) && typeof target === 'number') {
          acc += target;
        }
      }
    }
  }
  return mode === 'sum' ? acc : count;
}

/** Build a predicate from a SUMIF/COUNTIF criterion (number, text, or ">5"). */
function makeCriterion(criterion: CellScalar): (value: CellScalar) => boolean {
  if (typeof criterion === 'number' || typeof criterion === 'boolean') {
    return (v) => v === criterion;
  }
  if (criterion === null) {
    return (v) => v === null;
  }
  // The pattern matches any string, so `exec` never returns null and group 2
  // (`.*`) is always present; only the optional operator (group 1) may be undefined.
  const m = /^(<=|>=|<>|<|>|=)?(.*)$/.exec(criterion) as RegExpExecArray;
  const op = m[1] ?? '';
  const rhsRaw = m[2]!;
  const rhsNum = Number(rhsRaw);
  const rhsIsNum = rhsRaw.trim() !== '' && !Number.isNaN(rhsNum);

  if (op === '' || op === '=') {
    return (v) => (rhsIsNum ? Number(v) === rhsNum : toText(v).toUpperCase() === rhsRaw.toUpperCase());
  }
  if (op === '<>') {
    return (v) => (rhsIsNum ? Number(v) !== rhsNum : toText(v).toUpperCase() !== rhsRaw.toUpperCase());
  }
  // Numeric comparisons.
  return (v) => {
    if (!rhsIsNum) return false;
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isNaN(n)) return false;
    switch (op) {
      case '<':
        return n < rhsNum;
      case '>':
        return n > rhsNum;
      case '<=':
        return n <= rhsNum;
      case '>=':
        return n >= rhsNum;
      /* v8 ignore next 2 -- op is constrained to the comparison set above */
      default:
        return false;
    }
  };
}

// ── Range helpers (Phase 12) ─────────────────────────────────────────────────
/** Evaluate an arg node to a Matrix, wrapping a scalar as a 1x1 grid. */
function argMatrix(node: AstNode, evaluate: Evaluate): Matrix {
  const v = evaluate(node);
  if (Array.isArray(v)) return v;
  return [[v]];
}

/** Flatten a Matrix into a row-major list of scalars/errors. */
function flatten(matrix: Matrix): (CellScalar | FormulaError)[] {
  const out: (CellScalar | FormulaError)[] = [];
  for (const row of matrix) {
    for (const cell of row) {
      out.push(cell);
    }
  }
  return out;
}

/**
 * Collect numbers from a Matrix, skipping non-numeric cells (Excel range
 * behavior). Errors propagate.
 */
function matrixNumbers(matrix: Matrix): number[] | FormulaError {
  const out: number[] = [];
  for (const cell of flatten(matrix)) {
    if (FormulaError.is(cell)) return cell;
    if (typeof cell === 'number') out.push(cell);
  }
  return out;
}

// ── Lookup / reference (Phase 12) ────────────────────────────────────────────
def('IFS', (args, evaluate) => {
  if (args.length < 2 || args.length % 2 !== 0) return VALUE;
  for (let i = 0; i < args.length; i += 2) {
    const cond = toBoolean(scalarize(evaluate(args[i]!)));
    if (FormulaError.is(cond)) return cond;
    if (cond) return evaluate(args[i + 1]!);
  }
  return NA;
});

def('SWITCH', (args, evaluate) => {
  if (args.length < 3) return VALUE;
  const target = scalarize(evaluate(args[0]!));
  if (FormulaError.is(target)) return target;
  let i = 1;
  for (; i + 1 < args.length; i += 2) {
    const candidate = scalarize(evaluate(args[i]!));
    if (FormulaError.is(candidate)) return candidate;
    if (compareScalars(target, candidate) === 0) {
      return evaluate(args[i + 1]!);
    }
  }
  // Trailing default (one arg left over).
  if (i < args.length) return evaluate(args[i]!);
  return NA;
});

def('CHOOSE', (args, evaluate) => {
  if (args.length < 2) return VALUE;
  const idx = argNumber(args[0], evaluate);
  if (FormulaError.is(idx)) return idx;
  const i = Math.trunc(idx);
  if (i < 1 || i > args.length - 1) return VALUE;
  return evaluate(args[i]!);
});

def('INDEX', (args, evaluate) => {
  const err = expectArgs(args, 2, 3);
  if (err) return err;
  const matrix = argMatrix(args[0]!, evaluate);
  const rowArg = argNumber(args[1], evaluate);
  if (FormulaError.is(rowArg)) return rowArg;
  const rowNum = Math.trunc(rowArg);
  const rows = matrix.length;
  // A resolved range / scalar always yields at least a 1x1 grid.
  const cols = matrix[0]!.length;

  let colNum: number;
  if (args.length === 3) {
    const colArg = argNumber(args[2], evaluate);
    if (FormulaError.is(colArg)) return colArg;
    colNum = Math.trunc(colArg);
  } else {
    // 2-arg form: a single-row range indexes columns; otherwise rows.
    if (rows === 1) {
      colNum = rowNum;
      return indexCell(matrix, 1, colNum, rows, cols);
    }
    colNum = 1;
  }
  return indexCell(matrix, rowNum, colNum, rows, cols);
});

function indexCell(
  matrix: Matrix,
  rowNum: number,
  colNum: number,
  rows: number,
  cols: number,
): CellScalar | FormulaError {
  if (rowNum < 1 || colNum < 1 || rowNum > rows || colNum > cols) return REF;
  return matrix[rowNum - 1]![colNum - 1]!;
}

/**
 * Locate `lookup` within a flat list. type 1 = largest value <= lookup in an
 * ascending list; 0 = exact; -1 = smallest value >= lookup in a descending
 * list. Returns the 1-based position or null when not found.
 */
function matchPosition(
  lookup: CellScalar,
  values: (CellScalar | FormulaError)[],
  type: number,
): number | null {
  if (type === 0) {
    for (let i = 0; i < values.length; i++) {
      const v = values[i]!;
      if (FormulaError.is(v)) continue;
      if (compareScalars(lookup, v) === 0) return i + 1;
    }
    return null;
  }
  let best: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (FormulaError.is(v)) continue;
    const cmp = compareScalars(v, lookup);
    if (type === 1) {
      if (cmp <= 0) best = i + 1;
    } else {
      // type === -1
      if (cmp >= 0) best = i + 1;
    }
  }
  return best;
}

def('MATCH', (args, evaluate) => {
  const err = expectArgs(args, 2, 3);
  if (err) return err;
  const lookup = scalarize(evaluate(args[0]!));
  if (FormulaError.is(lookup)) return lookup;
  const matrix = argMatrix(args[1]!, evaluate);
  const type = args.length === 3 ? argNumber(args[2], evaluate) : 1;
  if (FormulaError.is(type)) return type;
  const t = Math.sign(Math.trunc(type));
  const pos = matchPosition(lookup, flatten(matrix), t);
  return pos === null ? NA : pos;
});

function lookupImpl(orientation: 'v' | 'h'): FunctionImpl {
  return (args, evaluate) => {
    const err = expectArgs(args, 3, 4);
    if (err) return err;
    const lookup = scalarize(evaluate(args[0]!));
    if (FormulaError.is(lookup)) return lookup;
    const matrix = argMatrix(args[1]!, evaluate);
    const idxArg = argNumber(args[2], evaluate);
    if (FormulaError.is(idxArg)) return idxArg;
    const index = Math.trunc(idxArg);
    if (index < 1) return VALUE;
    const approx = args.length === 4 ? toBoolean(scalarize(evaluate(args[3]!))) : true;
    if (FormulaError.is(approx)) return approx;

    // Build the lookup vector: first column (V) or first row (H).
    const rows = matrix.length;
    // A resolved range / scalar always yields at least a 1x1 grid.
    const cols = matrix[0]!.length;
    const vector: (CellScalar | FormulaError)[] =
      orientation === 'v' ? matrix.map((row) => row[0]!) : matrix[0]!;

    const pos = matchPosition(lookup, vector, approx ? 1 : 0);
    if (pos === null) return NA;

    if (orientation === 'v') {
      if (index > cols) return REF;
      return matrix[pos - 1]![index - 1]!;
    }
    if (index > rows) return REF;
    return matrix[index - 1]![pos - 1]!;
  };
}
def('VLOOKUP', lookupImpl('v'));
def('HLOOKUP', lookupImpl('h'));

// ── Math (Phase 12) ──────────────────────────────────────────────────────────
def('SUMPRODUCT', (args, evaluate) => {
  if (args.length < 1) return VALUE;
  const matrices: Matrix[] = [];
  for (const arg of args) {
    matrices.push(argMatrix(arg, evaluate));
  }
  const first = matrices[0]!;
  const rows = first.length;
  // A resolved range / scalar always yields at least a 1x1 grid.
  const cols = first[0]!.length;
  for (const m of matrices) {
    if (m.length !== rows || m[0]!.length !== cols) return VALUE;
  }
  let total = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let prod = 1;
      for (const m of matrices) {
        const cell = m[r]![c]!;
        if (FormulaError.is(cell)) return cell;
        prod *= typeof cell === 'number' ? cell : typeof cell === 'boolean' ? (cell ? 1 : 0) : 0;
      }
      total += prod;
    }
  }
  return total;
});

function gcd2(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

def('GCD', (args, evaluate) => {
  if (args.length < 1) return VALUE;
  const nums = collectNumbers(args, evaluate);
  if (FormulaError.is(nums)) return nums;
  let result = 0;
  for (const n of nums) {
    const t = Math.trunc(n);
    if (t < 0) return NUM;
    result = gcd2(result, t);
  }
  return result;
});

def('LCM', (args, evaluate) => {
  if (args.length < 1) return VALUE;
  const nums = collectNumbers(args, evaluate);
  if (FormulaError.is(nums)) return nums;
  let result = 1;
  for (const n of nums) {
    const t = Math.trunc(n);
    if (t < 0) return NUM;
    if (t === 0) return 0;
    result = (result / gcd2(result, t)) * t;
  }
  return result;
});

def('FACT', (args, evaluate) => {
  const err = expectArgs(args, 1);
  if (err) return err;
  const x = argNumber(args[0], evaluate);
  if (FormulaError.is(x)) return x;
  const n = Math.trunc(x);
  if (n < 0) return NUM;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
});

def('COMBIN', (args, evaluate) => {
  const err = expectArgs(args, 2);
  if (err) return err;
  const nArg = argNumber(args[0], evaluate);
  if (FormulaError.is(nArg)) return nArg;
  const kArg = argNumber(args[1], evaluate);
  if (FormulaError.is(kArg)) return kArg;
  const n = Math.trunc(nArg);
  const k = Math.trunc(kArg);
  if (n < 0 || k < 0 || k > n) return NUM;
  let result = 1;
  for (let i = 1; i <= k; i++) {
    result = (result * (n - k + i)) / i;
  }
  return Math.round(result);
});

def('QUOTIENT', (args, evaluate) => {
  const err = expectArgs(args, 2);
  if (err) return err;
  const a = argNumber(args[0], evaluate);
  if (FormulaError.is(a)) return a;
  const b = argNumber(args[1], evaluate);
  if (FormulaError.is(b)) return b;
  if (b === 0) return DIV0;
  return Math.trunc(a / b);
});

def('PI', (args) => (args.length === 0 ? Math.PI : VALUE));
def('RADIANS', unaryMath((x) => (x * Math.PI) / 180));
def('DEGREES', unaryMath((x) => (x * 180) / Math.PI));
def('SIN', unaryMath((x) => Math.sin(x)));
def('COS', unaryMath((x) => Math.cos(x)));
def('TAN', unaryMath((x) => Math.tan(x)));
def('ATAN', unaryMath((x) => Math.atan(x)));

def('ATAN2', (args, evaluate) => {
  const err = expectArgs(args, 2);
  if (err) return err;
  const x = argNumber(args[0], evaluate);
  if (FormulaError.is(x)) return x;
  const y = argNumber(args[1], evaluate);
  if (FormulaError.is(y)) return y;
  if (x === 0 && y === 0) return DIV0;
  // Excel ATAN2(x_num, y_num) = angle of (x, y).
  return Math.atan2(y, x);
});

// ── Statistics (Phase 12) ────────────────────────────────────────────────────
def('STDEV', (args, evaluate) => varStdev(args, evaluate, true));
def('VAR', (args, evaluate) => varStdev(args, evaluate, false));

function varStdev(args: readonly AstNode[], evaluate: Evaluate, stdev: boolean): FormulaValue {
  const nums = collectNumbers(args, evaluate);
  if (FormulaError.is(nums)) return nums;
  if (nums.length < 2) return DIV0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const ss = nums.reduce((a, b) => a + (b - mean) ** 2, 0);
  const variance = ss / (nums.length - 1);
  return stdev ? Math.sqrt(variance) : variance;
}

function largeSmall(largest: boolean): FunctionImpl {
  return (args, evaluate) => {
    const err = expectArgs(args, 2);
    if (err) return err;
    const nums = matrixNumbers(argMatrix(args[0]!, evaluate));
    if (FormulaError.is(nums)) return nums;
    const kArg = argNumber(args[1], evaluate);
    if (FormulaError.is(kArg)) return kArg;
    const k = Math.trunc(kArg);
    if (k < 1 || k > nums.length) return NUM;
    const sorted = [...nums].sort((a, b) => (largest ? b - a : a - b));
    return sorted[k - 1]!;
  };
}
def('LARGE', largeSmall(true));
def('SMALL', largeSmall(false));

def('RANK', (args, evaluate) => {
  const err = expectArgs(args, 2, 3);
  if (err) return err;
  const x = argNumber(args[0], evaluate);
  if (FormulaError.is(x)) return x;
  const nums = matrixNumbers(argMatrix(args[1]!, evaluate));
  if (FormulaError.is(nums)) return nums;
  const order = args.length === 3 ? argNumber(args[2], evaluate) : 0;
  if (FormulaError.is(order)) return order;
  const ascending = order !== 0;
  if (!nums.includes(x)) return NA;
  let rank = 1;
  for (const n of nums) {
    if (ascending ? n < x : n > x) rank++;
  }
  return rank;
});

/**
 * Evaluate (range, criteria) pairs against a parallel result/count grid.
 * `args` starts at the first range; pairs are consumed two at a time.
 */
function multiCriteria(
  pairs: readonly AstNode[],
  evaluate: Evaluate,
): { matches: boolean[][]; rows: number; cols: number } | FormulaError {
  const firstRange = argMatrix(pairs[0]!, evaluate);
  const rows = firstRange.length;
  // A resolved range / scalar always yields at least a 1x1 grid.
  const cols = firstRange[0]!.length;
  const matches: boolean[][] = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(true));
  for (let p = 0; p < pairs.length; p += 2) {
    const range = argMatrix(pairs[p]!, evaluate);
    if (range.length !== rows || range[0]!.length !== cols) return VALUE;
    const criterion = scalarize(evaluate(pairs[p + 1]!));
    if (FormulaError.is(criterion)) return criterion;
    const predicate = makeCriterion(criterion);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = range[r]![c]!;
        if (FormulaError.is(cell) || !predicate(cell)) matches[r]![c] = false;
      }
    }
  }
  return { matches, rows, cols };
}

def('COUNTIFS', (args, evaluate) => {
  if (args.length < 2 || args.length % 2 !== 0) return VALUE;
  const res = multiCriteria(args, evaluate);
  if (FormulaError.is(res)) return res;
  let count = 0;
  for (let r = 0; r < res.rows; r++) {
    for (let c = 0; c < res.cols; c++) {
      if (res.matches[r]![c]) count++;
    }
  }
  return count;
});

def('SUMIFS', (args, evaluate) => {
  // SUMIFS(sum_range, criteria_range1, criteria1, ...)
  if (args.length < 3 || args.length % 2 !== 1) return VALUE;
  const sumRange = argMatrix(args[0]!, evaluate);
  const res = multiCriteria(args.slice(1), evaluate);
  if (FormulaError.is(res)) return res;
  if (sumRange.length !== res.rows || (res.rows > 0 && sumRange[0]!.length !== res.cols)) {
    return VALUE;
  }
  let total = 0;
  for (let r = 0; r < res.rows; r++) {
    for (let c = 0; c < res.cols; c++) {
      if (!res.matches[r]![c]) continue;
      const cell = sumRange[r]![c]!;
      if (!FormulaError.is(cell) && typeof cell === 'number') total += cell;
    }
  }
  return total;
});

def('AVERAGEIF', (args, evaluate) => {
  const err = expectArgs(args, 2, 3);
  if (err) return err;
  const range = argMatrix(args[0]!, evaluate);
  const criterion = scalarize(evaluate(args[1]!));
  if (FormulaError.is(criterion)) return criterion;
  const predicate = makeCriterion(criterion);
  const avgRange = args.length === 3 ? argMatrix(args[2]!, evaluate) : range;
  let total = 0;
  let count = 0;
  for (let r = 0; r < range.length; r++) {
    const row = range[r]!;
    for (let c = 0; c < row.length; c++) {
      const cell = row[c]!;
      if (FormulaError.is(cell) || !predicate(cell)) continue;
      const target = avgRange[r]?.[c] ?? null;
      if (!FormulaError.is(target) && typeof target === 'number') {
        total += target;
        count++;
      }
    }
  }
  if (count === 0) return DIV0;
  return total / count;
});

// ── Text (Phase 12) ──────────────────────────────────────────────────────────
def('CLEAN', (args, evaluate) => {
  const err = expectArgs(args, 1);
  if (err) return err;
  const t = argText(args[0], evaluate);
  if (FormulaError.is(t)) return t;
  // Strip ASCII control characters (0x00-0x1F).
  return t.replace(/[\u0000-\u001F]/g, '');
});

def('CHAR', (args, evaluate) => {
  const err = expectArgs(args, 1);
  if (err) return err;
  const x = argNumber(args[0], evaluate);
  if (FormulaError.is(x)) return x;
  const code = Math.trunc(x);
  if (code < 1 || code > 255) return VALUE;
  return String.fromCharCode(code);
});

def('CODE', (args, evaluate) => {
  const err = expectArgs(args, 1);
  if (err) return err;
  const t = argText(args[0], evaluate);
  if (FormulaError.is(t)) return t;
  if (t.length === 0) return VALUE;
  return t.charCodeAt(0);
});

def('EXACT', (args, evaluate) => {
  const err = expectArgs(args, 2);
  if (err) return err;
  const a = argText(args[0], evaluate);
  if (FormulaError.is(a)) return a;
  const b = argText(args[1], evaluate);
  if (FormulaError.is(b)) return b;
  return a === b;
});

def('SEARCH', (args, evaluate) => {
  const err = expectArgs(args, 2, 3);
  if (err) return err;
  const needle = argText(args[0], evaluate);
  if (FormulaError.is(needle)) return needle;
  const hay = argText(args[1], evaluate);
  if (FormulaError.is(hay)) return hay;
  const start = args.length === 3 ? argNumber(args[2], evaluate) : 1;
  if (FormulaError.is(start)) return start;
  if (start < 1) return VALUE;
  const idx = hay.toUpperCase().indexOf(needle.toUpperCase(), Math.trunc(start) - 1);
  return idx === -1 ? VALUE : idx + 1;
});

def('NUMBERVALUE', (args, evaluate) => {
  const err = expectArgs(args, 1, 3);
  if (err) return err;
  const t = argText(args[0], evaluate);
  if (FormulaError.is(t)) return t;
  let decimalSep = '.';
  if (args.length >= 2) {
    const d = argText(args[1], evaluate);
    if (FormulaError.is(d)) return d;
    if (d.length > 0) decimalSep = d[0]!;
  }
  let groupSep = ',';
  if (args.length === 3) {
    const g = argText(args[2], evaluate);
    if (FormulaError.is(g)) return g;
    if (g.length > 0) groupSep = g[0]!;
  }
  let normalized = t.split(groupSep).join('').split(decimalSep).join('.');
  normalized = normalized.replace(/\s+/g, '');
  if (normalized === '') return 0;
  const n = Number(normalized);
  return Number.isNaN(n) ? VALUE : n;
});

def('TEXT', (args, evaluate) => {
  const err = expectArgs(args, 2);
  if (err) return err;
  const x = argNumber(args[0], evaluate);
  if (FormulaError.is(x)) return x;
  const fmt = argText(args[1], evaluate);
  if (FormulaError.is(fmt)) return fmt;
  return formatNumber(x, fmt);
});

/** Minimal numeric format engine: supports '0', '0.00', '#,##0', '#,##0.00'. */
function formatNumber(value: number, fmt: string): string {
  const grouping = fmt.includes(',');
  const dotIndex = fmt.indexOf('.');
  const decimals = dotIndex === -1 ? 0 : fmt.length - dotIndex - 1;
  const fixed = value.toFixed(decimals);
  if (!grouping) return fixed;
  const negative = fixed.startsWith('-');
  const unsigned = negative ? fixed.slice(1) : fixed;
  const parts = unsigned.split('.');
  const intPart = parts[0]!;
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const out = parts.length === 2 ? `${grouped}.${parts[1]!}` : grouped;
  return negative ? `-${out}` : out;
}

// ── Date (Phase 13) ──────────────────────────────────────────────────────────
/**
 * Excel serial date epoch. Excel day 1 is 1900-01-01; serial 0 corresponds to
 * 1899-12-31. We use a UTC anchor and pure integer day arithmetic so results
 * are timezone-independent. Note: this clean-room implementation does NOT
 * reproduce Excel's fictitious 1900-02-29 leap-day bug.
 */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 31);
const MS_PER_DAY = 86_400_000;

/** Convert a (year, month, day) triple to an Excel serial number. */
function serialFromYMD(year: number, month: number, day: number): number {
  // Normalize month overflow/underflow into the year via UTC arithmetic.
  const ms = Date.UTC(year, month - 1, day);
  return Math.round((ms - EXCEL_EPOCH_UTC) / MS_PER_DAY);
}

/** Decompose an Excel serial number into UTC year/month/day parts. */
function ymdFromSerial(serial: number): { year: number; month: number; day: number } {
  const ms = EXCEL_EPOCH_UTC + Math.trunc(serial) * MS_PER_DAY;
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

def('DATE', (args, evaluate) => {
  const err = expectArgs(args, 3);
  if (err) return err;
  const year = argNumber(args[0], evaluate);
  if (FormulaError.is(year)) return year;
  const month = argNumber(args[1], evaluate);
  if (FormulaError.is(month)) return month;
  const day = argNumber(args[2], evaluate);
  if (FormulaError.is(day)) return day;
  const serial = serialFromYMD(Math.trunc(year), Math.trunc(month), Math.trunc(day));
  if (serial < 0) return NUM;
  return serial;
});

function datePartImpl(part: 'year' | 'month' | 'day'): FunctionImpl {
  return (args, evaluate) => {
    const err = expectArgs(args, 1);
    if (err) return err;
    const serial = argNumber(args[0], evaluate);
    if (FormulaError.is(serial)) return serial;
    if (serial < 0) return NUM;
    const ymd = ymdFromSerial(serial);
    return ymd[part];
  };
}
def('YEAR', datePartImpl('year'));
def('MONTH', datePartImpl('month'));
def('DAY', datePartImpl('day'));

def('EDATE', (args, evaluate) => {
  const err = expectArgs(args, 2);
  if (err) return err;
  const serial = argNumber(args[0], evaluate);
  if (FormulaError.is(serial)) return serial;
  if (serial < 0) return NUM;
  const months = argNumber(args[1], evaluate);
  if (FormulaError.is(months)) return months;
  const { year, month, day } = ymdFromSerial(serial);
  const targetMonth = month + Math.trunc(months);
  // Excel clamps to the last day of the target month (e.g. Jan 31 +1 -> Feb 28).
  const lastDay = serialFromYMD(year, targetMonth + 1, 0);
  const wanted = serialFromYMD(year, targetMonth, day);
  const result = Math.min(wanted, lastDay);
  if (result < 0) return NUM;
  return result;
});

def('EOMONTH', (args, evaluate) => {
  const err = expectArgs(args, 2);
  if (err) return err;
  const serial = argNumber(args[0], evaluate);
  if (FormulaError.is(serial)) return serial;
  if (serial < 0) return NUM;
  const months = argNumber(args[1], evaluate);
  if (FormulaError.is(months)) return months;
  const { year, month } = ymdFromSerial(serial);
  // Day 0 of the next month is the last day of the target month.
  const result = serialFromYMD(year, month + Math.trunc(months) + 1, 0);
  if (result < 0) return NUM;
  return result;
});

def('WEEKDAY', (args, evaluate) => {
  const err = expectArgs(args, 1, 2);
  if (err) return err;
  const serial = argNumber(args[0], evaluate);
  if (FormulaError.is(serial)) return serial;
  if (serial < 0) return NUM;
  const type = args.length === 2 ? argNumber(args[1], evaluate) : 1;
  if (FormulaError.is(type)) return type;
  const ms = EXCEL_EPOCH_UTC + Math.trunc(serial) * MS_PER_DAY;
  // getUTCDay(): Sun=0 .. Sat=6.
  const dow = new Date(ms).getUTCDay();
  switch (Math.trunc(type)) {
    case 1:
      // Sun=1 .. Sat=7
      return dow + 1;
    case 2:
      // Mon=1 .. Sun=7
      return ((dow + 6) % 7) + 1;
    case 3:
      // Mon=0 .. Sun=6
      return (dow + 6) % 7;
    default:
      return NUM;
  }
});

def('DATEDIF', (args, evaluate) => {
  const err = expectArgs(args, 3);
  if (err) return err;
  const startN = argNumber(args[0], evaluate);
  if (FormulaError.is(startN)) return startN;
  const endN = argNumber(args[1], evaluate);
  if (FormulaError.is(endN)) return endN;
  const unit = argText(args[2], evaluate);
  if (FormulaError.is(unit)) return unit;
  const start = Math.trunc(startN);
  const end = Math.trunc(endN);
  if (start < 0 || end < 0 || end < start) return NUM;
  const s = ymdFromSerial(start);
  const e = ymdFromSerial(end);
  switch (unit.toUpperCase()) {
    case 'D':
      return end - start;
    case 'Y': {
      let years = e.year - s.year;
      // Subtract a year if the end has not yet reached the anniversary.
      if (e.month < s.month || (e.month === s.month && e.day < s.day)) years--;
      return years;
    }
    case 'M': {
      let months = (e.year - s.year) * 12 + (e.month - s.month);
      if (e.day < s.day) months--;
      return months;
    }
    default:
      return NUM;
  }
});

def('DATEVALUE', (args, evaluate) => {
  const err = expectArgs(args, 1);
  if (err) return err;
  const t = argText(args[0], evaluate);
  if (FormulaError.is(t)) return t;
  // Strict ISO yyyy-mm-dd parsing to stay deterministic & timezone-safe.
  const m = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/.exec(t);
  if (m === null) return VALUE;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return VALUE;
  const serial = serialFromYMD(year, month, day);
  // Reject overflow dates that rolled into another month (e.g. 2021-02-30).
  const back = ymdFromSerial(serial);
  if (back.year !== year || back.month !== month || back.day !== day) return VALUE;
  if (serial < 0) return VALUE;
  return serial;
});

// ── Financial (Phase 13) ─────────────────────────────────────────────────────
/** Read an optional numeric arg at index `i`, defaulting when absent. */
function optNumber(
  args: readonly AstNode[],
  i: number,
  evaluate: Evaluate,
  fallback: number,
): number | FormulaError {
  if (args.length <= i) return fallback;
  return argNumber(args[i], evaluate);
}

/** Future value of pmt + pv over nper periods at a fixed rate. */
function fvFormula(rate: number, nper: number, pmt: number, pv: number, type: number): number {
  if (rate === 0) {
    return -(pv + pmt * nper);
  }
  const factor = Math.pow(1 + rate, nper);
  return -(pv * factor + pmt * (1 + rate * type) * ((factor - 1) / rate));
}

def('PMT', (args, evaluate) => {
  const err = expectArgs(args, 3, 5);
  if (err) return err;
  const rate = argNumber(args[0], evaluate);
  if (FormulaError.is(rate)) return rate;
  const nper = argNumber(args[1], evaluate);
  if (FormulaError.is(nper)) return nper;
  const pv = argNumber(args[2], evaluate);
  if (FormulaError.is(pv)) return pv;
  const fv = optNumber(args, 3, evaluate, 0);
  if (FormulaError.is(fv)) return fv;
  const type = optNumber(args, 4, evaluate, 0);
  if (FormulaError.is(type)) return type;
  if (nper === 0) return NUM;
  if (rate === 0) {
    return -(pv + fv) / nper;
  }
  const factor = Math.pow(1 + rate, nper);
  return -(rate * (pv * factor + fv)) / ((1 + rate * type) * (factor - 1));
});

def('FV', (args, evaluate) => {
  const err = expectArgs(args, 3, 5);
  if (err) return err;
  const rate = argNumber(args[0], evaluate);
  if (FormulaError.is(rate)) return rate;
  const nper = argNumber(args[1], evaluate);
  if (FormulaError.is(nper)) return nper;
  const pmt = argNumber(args[2], evaluate);
  if (FormulaError.is(pmt)) return pmt;
  const pv = optNumber(args, 3, evaluate, 0);
  if (FormulaError.is(pv)) return pv;
  const type = optNumber(args, 4, evaluate, 0);
  if (FormulaError.is(type)) return type;
  return fvFormula(rate, nper, pmt, pv, type);
});

def('PV', (args, evaluate) => {
  const err = expectArgs(args, 3, 5);
  if (err) return err;
  const rate = argNumber(args[0], evaluate);
  if (FormulaError.is(rate)) return rate;
  const nper = argNumber(args[1], evaluate);
  if (FormulaError.is(nper)) return nper;
  const pmt = argNumber(args[2], evaluate);
  if (FormulaError.is(pmt)) return pmt;
  const fv = optNumber(args, 3, evaluate, 0);
  if (FormulaError.is(fv)) return fv;
  const type = optNumber(args, 4, evaluate, 0);
  if (FormulaError.is(type)) return type;
  if (rate === 0) {
    return -(fv + pmt * nper);
  }
  const factor = Math.pow(1 + rate, nper);
  return -(fv + pmt * (1 + rate * type) * ((factor - 1) / rate)) / factor;
});

def('NPV', (args, evaluate) => {
  if (args.length < 2) return VALUE;
  const rate = argNumber(args[0], evaluate);
  if (FormulaError.is(rate)) return rate;
  if (rate === -1) return DIV0;
  const nums = collectNumbers(args.slice(1), evaluate);
  if (FormulaError.is(nums)) return nums;
  let total = 0;
  for (let i = 0; i < nums.length; i++) {
    total += nums[i]! / Math.pow(1 + rate, i + 1);
  }
  return total;
});

// ── Math / info (Phase 13) ───────────────────────────────────────────────────
def('MROUND', (args, evaluate) => {
  const err = expectArgs(args, 2);
  if (err) return err;
  const x = argNumber(args[0], evaluate);
  if (FormulaError.is(x)) return x;
  const multiple = argNumber(args[1], evaluate);
  if (FormulaError.is(multiple)) return multiple;
  if (multiple === 0) return 0;
  // Excel: x and multiple must share the same sign.
  if (Math.sign(x) !== Math.sign(multiple) && x !== 0) return NUM;
  return Math.round(x / multiple) * multiple;
});

def('EVEN', (args, evaluate) => {
  const err = expectArgs(args, 1);
  if (err) return err;
  const x = argNumber(args[0], evaluate);
  if (FormulaError.is(x)) return x;
  const sign = x < 0 ? -1 : 1;
  return sign * Math.ceil(Math.abs(x) / 2) * 2;
});

def('ODD', (args, evaluate) => {
  const err = expectArgs(args, 1);
  if (err) return err;
  const x = argNumber(args[0], evaluate);
  if (FormulaError.is(x)) return x;
  if (x === 0) return 1;
  const sign = x < 0 ? -1 : 1;
  const m = Math.ceil(Math.abs(x));
  const rounded = m % 2 === 0 ? m + 1 : m;
  return sign * rounded;
});

function parityImpl(wantEven: boolean): FunctionImpl {
  return (args, evaluate) => {
    const err = expectArgs(args, 1);
    if (err) return err;
    const x = argNumber(args[0], evaluate);
    if (FormulaError.is(x)) return x;
    const isEven = Math.trunc(Math.abs(x)) % 2 === 0;
    return wantEven ? isEven : !isEven;
  };
}
def('ISEVEN', parityImpl(true));
def('ISODD', parityImpl(false));

// ── Statistics (Phase 14) ────────────────────────────────────────────────────
def('MODE', (args, evaluate) => {
  const nums = collectNumbers(args, evaluate);
  if (FormulaError.is(nums)) return nums;
  // Excel returns the most frequent value; ties resolve to the earliest seen.
  const counts = new Map<number, number>();
  let best: number | null = null;
  let bestCount = 1;
  for (const n of nums) {
    const c = (counts.get(n) ?? 0) + 1;
    counts.set(n, c);
    if (c > bestCount) {
      bestCount = c;
      best = n;
    }
  }
  if (best === null) return NA;
  return best;
});

def('GEOMEAN', (args, evaluate) => {
  const nums = collectNumbers(args, evaluate);
  if (FormulaError.is(nums)) return nums;
  if (nums.length === 0) return NUM;
  let logSum = 0;
  for (const n of nums) {
    if (n <= 0) return NUM;
    logSum += Math.log(n);
  }
  return Math.exp(logSum / nums.length);
});

def('HARMEAN', (args, evaluate) => {
  const nums = collectNumbers(args, evaluate);
  if (FormulaError.is(nums)) return nums;
  if (nums.length === 0) return NUM;
  let recipSum = 0;
  for (const n of nums) {
    if (n <= 0) return NUM;
    recipSum += 1 / n;
  }
  return nums.length / recipSum;
});

function popVarStdev(args: readonly AstNode[], evaluate: Evaluate, stdev: boolean): FormulaValue {
  const nums = collectNumbers(args, evaluate);
  if (FormulaError.is(nums)) return nums;
  if (nums.length === 0) return DIV0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const ss = nums.reduce((a, b) => a + (b - mean) ** 2, 0);
  const variance = ss / nums.length;
  return stdev ? Math.sqrt(variance) : variance;
}
def('VARP', (args, evaluate) => popVarStdev(args, evaluate, false));
def('STDEVP', (args, evaluate) => popVarStdev(args, evaluate, true));

def('SUMSQ', (args, evaluate) => {
  const nums = collectNumbers(args, evaluate);
  if (FormulaError.is(nums)) return nums;
  return nums.reduce((a, b) => a + b * b, 0);
});

/** Linear-interpolation percentile (Excel PERCENTILE.INC) for k in [0,1]. */
function percentileInc(sorted: readonly number[], k: number): number {
  // sorted is non-empty; rank in [0, n-1].
  const rank = k * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const lowVal = sorted[lo]!;
  if (lo === hi) return lowVal;
  const frac = rank - lo;
  return lowVal + (sorted[hi]! - lowVal) * frac;
}

def('PERCENTILE', (args, evaluate) => {
  const err = expectArgs(args, 2);
  if (err) return err;
  const nums = matrixNumbers(argMatrix(args[0]!, evaluate));
  if (FormulaError.is(nums)) return nums;
  const kArg = argNumber(args[1], evaluate);
  if (FormulaError.is(kArg)) return kArg;
  if (nums.length === 0) return NUM;
  if (kArg < 0 || kArg > 1) return NUM;
  const sorted = [...nums].sort((a, b) => a - b);
  return percentileInc(sorted, kArg);
});

def('QUARTILE', (args, evaluate) => {
  const err = expectArgs(args, 2);
  if (err) return err;
  const nums = matrixNumbers(argMatrix(args[0]!, evaluate));
  if (FormulaError.is(nums)) return nums;
  const qArg = argNumber(args[1], evaluate);
  if (FormulaError.is(qArg)) return qArg;
  if (nums.length === 0) return NUM;
  const q = Math.trunc(qArg);
  if (q < 0 || q > 4) return NUM;
  const sorted = [...nums].sort((a, b) => a - b);
  return percentileInc(sorted, q / 4);
});

def('AVERAGEA', (args, evaluate) => {
  // AVERAGEA counts text (as 0) and booleans, unlike AVERAGE which skips text.
  let total = 0;
  let count = 0;
  for (const { value } of iterateValues(args, evaluate)) {
    if (FormulaError.is(value)) return value;
    if (typeof value === 'number') {
      total += value;
      count++;
    } else if (typeof value === 'boolean') {
      total += value ? 1 : 0;
      count++;
    } else if (typeof value === 'string') {
      // Text counts as 0.
      count++;
    }
    // null (blank) is skipped entirely.
  }
  if (count === 0) return DIV0;
  return total / count;
});

/**
 * Shared MAXIFS/MINIFS core: aggregate `valueRange` over cells whose parallel
 * criteria ranges all match, reusing the COUNTIF/SUMIF criterion predicate.
 */
function maxMinIfs(args: readonly AstNode[], evaluate: Evaluate, wantMax: boolean): FormulaValue {
  // MAXIFS(value_range, criteria_range1, criteria1, ...)
  if (args.length < 3 || args.length % 2 !== 1) return VALUE;
  const valueRange = argMatrix(args[0]!, evaluate);
  const res = multiCriteria(args.slice(1), evaluate);
  if (FormulaError.is(res)) return res;
  if (valueRange.length !== res.rows || (res.rows > 0 && valueRange[0]!.length !== res.cols)) {
    return VALUE;
  }
  let best: number | null = null;
  for (let r = 0; r < res.rows; r++) {
    for (let c = 0; c < res.cols; c++) {
      if (!res.matches[r]![c]) continue;
      const cell = valueRange[r]![c]!;
      if (FormulaError.is(cell) || typeof cell !== 'number') continue;
      if (best === null || (wantMax ? cell > best : cell < best)) best = cell;
    }
  }
  // Excel returns 0 when no cells match.
  return best === null ? 0 : best;
}
def('MAXIFS', (args, evaluate) => maxMinIfs(args, evaluate, true));
def('MINIFS', (args, evaluate) => maxMinIfs(args, evaluate, false));

// ── Text (Phase 14) ──────────────────────────────────────────────────────────
def('REPLACE', (args, evaluate) => {
  const err = expectArgs(args, 4);
  if (err) return err;
  const old = argText(args[0], evaluate);
  if (FormulaError.is(old)) return old;
  const startN = argNumber(args[1], evaluate);
  if (FormulaError.is(startN)) return startN;
  const lenN = argNumber(args[2], evaluate);
  if (FormulaError.is(lenN)) return lenN;
  const insert = argText(args[3], evaluate);
  if (FormulaError.is(insert)) return insert;
  const start = Math.trunc(startN);
  const len = Math.trunc(lenN);
  if (start < 1 || len < 0) return VALUE;
  const before = old.slice(0, start - 1);
  const after = old.slice(start - 1 + len);
  return before + insert + after;
});

def('FIXED', (args, evaluate) => {
  const err = expectArgs(args, 1, 3);
  if (err) return err;
  const x = argNumber(args[0], evaluate);
  if (FormulaError.is(x)) return x;
  const decArg = args.length >= 2 ? argNumber(args[1], evaluate) : 2;
  if (FormulaError.is(decArg)) return decArg;
  let noCommas = false;
  if (args.length === 3) {
    const nc = toBoolean(scalarize(evaluate(args[2]!)));
    if (FormulaError.is(nc)) return nc;
    noCommas = nc;
  }
  const decimals = Math.trunc(decArg);
  // Negative decimals round to the left of the decimal point (Excel behavior).
  let value = x;
  if (decimals < 0) {
    const factor = Math.pow(10, -decimals);
    value = Math.round(x / factor) * factor;
  }
  const fixed = value.toFixed(Math.max(decimals, 0));
  if (noCommas) return fixed;
  const negative = fixed.startsWith('-');
  const unsigned = negative ? fixed.slice(1) : fixed;
  const parts = unsigned.split('.');
  const grouped = parts[0]!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const out = parts.length === 2 ? `${grouped}.${parts[1]!}` : grouped;
  return negative ? `-${out}` : out;
});

def('UNICHAR', (args, evaluate) => {
  const err = expectArgs(args, 1);
  if (err) return err;
  const x = argNumber(args[0], evaluate);
  if (FormulaError.is(x)) return x;
  const code = Math.trunc(x);
  // Valid Unicode code points: 1 .. 0x10FFFF, excluding surrogate range.
  if (code < 1 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return VALUE;
  return String.fromCodePoint(code);
});

def('UNICODE', (args, evaluate) => {
  const err = expectArgs(args, 1);
  if (err) return err;
  const t = argText(args[0], evaluate);
  if (FormulaError.is(t)) return t;
  if (t.length === 0) return VALUE;
  // codePointAt(0) is defined for any non-empty string.
  return t.codePointAt(0)!;
});

// ── Dynamic arrays (Phase 12c — spill) ───────────────────────────────────────
// These functions return a {@link Matrix}; when used as a top-level cell formula
// the engine spills the result into the adjacent cells.

/** A stable, type-aware key for a cell value (for row de-duplication). */
function scalarKey(cell: CellScalar | FormulaError): string {
  if (FormulaError.is(cell)) return `e:${cell.type}`;
  if (cell === null) return 'z:';
  return `${typeof cell}:${String(cell)}`;
}

def('TRANSPOSE', (args, evaluate) => {
  const err = expectArgs(args, 1);
  if (err) return err;
  const m = argMatrix(args[0]!, evaluate);
  const rows = m.length;
  // argMatrix always yields at least a 1×1 grid, so rows ≥ 1 and cols ≥ 1.
  const cols = m[0]!.length;
  const out: Matrix = [];
  for (let c = 0; c < cols; c++) {
    const line: (CellScalar | FormulaError)[] = [];
    for (let r = 0; r < rows; r++) {
      // Matrices from ranges/array functions are rectangular, so the slot exists.
      line.push(m[r]![c]!);
    }
    out.push(line);
  }
  return out;
});

def('SEQUENCE', (args, evaluate) => {
  const err = expectArgs(args, 1, 4);
  if (err) return err;
  const rowsArg = argNumber(args[0], evaluate);
  if (FormulaError.is(rowsArg)) return rowsArg;
  const rows = Math.trunc(rowsArg);
  let cols = 1;
  if (args.length >= 2) {
    const c = argNumber(args[1], evaluate);
    if (FormulaError.is(c)) return c;
    cols = Math.trunc(c);
  }
  let start = 1;
  if (args.length >= 3) {
    const s = argNumber(args[2], evaluate);
    if (FormulaError.is(s)) return s;
    start = s;
  }
  let step = 1;
  if (args.length >= 4) {
    const st = argNumber(args[3], evaluate);
    if (FormulaError.is(st)) return st;
    step = st;
  }
  if (rows < 1 || cols < 1) return VALUE;
  const out: Matrix = [];
  let n = start;
  for (let r = 0; r < rows; r++) {
    const line: (CellScalar | FormulaError)[] = [];
    for (let c = 0; c < cols; c++) {
      line.push(n);
      n += step;
    }
    out.push(line);
  }
  return out;
});

def('UNIQUE', (args, evaluate) => {
  const err = expectArgs(args, 1);
  if (err) return err;
  const m = argMatrix(args[0]!, evaluate);
  const seen = new Set<string>();
  const out: Matrix = [];
  for (const row of m) {
    const key = row.map(scalarKey).join(' ');
    if (!seen.has(key)) {
      seen.add(key);
      out.push([...row]);
    }
  }
  // argMatrix always yields at least one row, so `out` is non-empty.
  return out;
});

def('SORT', (args, evaluate) => {
  const err = expectArgs(args, 1, 3);
  if (err) return err;
  const m = argMatrix(args[0]!, evaluate);
  let idx = 1;
  if (args.length >= 2) {
    const i = argNumber(args[1], evaluate);
    if (FormulaError.is(i)) return i;
    idx = Math.trunc(i);
  }
  let order = 1;
  if (args.length >= 3) {
    const o = argNumber(args[2], evaluate);
    if (FormulaError.is(o)) return o;
    order = o;
  }
  // argMatrix always yields at least a 1×1 grid, so the first row exists.
  const cols = m[0]!.length;
  if (idx < 1 || idx > cols) return VALUE;
  const sign = order < 0 ? -1 : 1;
  const rows = m.map((r) => [...r]);
  rows.sort((a, b) => {
    const av = a[idx - 1]!;
    const bv = b[idx - 1]!;
    // Errors sort as equal (stable) rather than throwing.
    if (FormulaError.is(av) || FormulaError.is(bv)) return 0;
    return sign * compareScalars(av, bv);
  });
  return rows;
});

def('FILTER', (args, evaluate) => {
  const err = expectArgs(args, 2, 3);
  if (err) return err;
  const m = argMatrix(args[0]!, evaluate);
  const include = flatten(argMatrix(args[1]!, evaluate));
  // The include vector must have one entry per row of the array.
  if (include.length !== m.length) return VALUE;
  const out: Matrix = [];
  for (let i = 0; i < m.length; i++) {
    const keep = toBoolean(include[i]!);
    if (FormulaError.is(keep)) return keep;
    if (keep) out.push([...m[i]!]);
  }
  if (out.length === 0) {
    // Excel returns #CALC!; we surface the optional fallback or #N/A.
    return args.length === 3 ? [[scalarize(evaluate(args[2]!))]] : NA;
  }
  return out;
});

/** Build the default function registry. */
export function createDefaultFunctions(): FunctionRegistry {
  return new Map(registry);
}

/** Names of all built-in functions. */
export function builtinFunctionNames(): string[] {
  return [...registry.keys()].sort();
}

export type { EvalContext };
