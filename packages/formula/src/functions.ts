/**
 * Built-in function library. Clean-room implementations of common
 * Excel-compatible functions across math, statistics, logical, text, and
 * information categories. Functions receive AST arg nodes plus a re-entrant
 * `evaluate`, so they can be lazy where Excel requires it (IF / IFERROR).
 */

import type { AstNode } from './ast.js';
import type { EvalContext, FunctionImpl, FunctionRegistry } from './evaluator.js';
import { scalarize } from './evaluator.js';
import { FormulaError, DIV0, NA, NUM, VALUE } from './errors.js';
import {
  toBoolean,
  toNumber,
  toText,
  type CellScalar,
  type FormulaValue,
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

/** Build the default function registry. */
export function createDefaultFunctions(): FunctionRegistry {
  return new Map(registry);
}

/** Names of all built-in functions. */
export function builtinFunctionNames(): string[] {
  return [...registry.keys()].sort();
}

export type { EvalContext };
