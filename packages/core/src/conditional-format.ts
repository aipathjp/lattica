/**
 * Conditional formatting rule engine (pure).
 *
 * A small, dependency-free engine that maps a {@link CellValue} to a
 * {@link CfStyle} by evaluating an ordered list of {@link CfRule}s. The first
 * matching rule wins ({@link evaluateRules}); if none match the result is
 * `null` (no override). {@link ConditionalFormatModel} wraps the rule list with
 * mutation + subscription so a renderer can react to rule changes.
 *
 * Matching semantics ({@link ruleMatches}):
 * - Numeric comparisons (`gt`/`gte`/`lt`/`lte`/`between`) coerce the cell via
 *   `Number()`; a value that does not coerce to a finite number never matches.
 * - `eq`/`ne` compare numerically when `rule.value` is a number, otherwise they
 *   compare `String(value)` against the rule's string.
 * - `contains` does a case-insensitive substring test on `String(value)`.
 * - `empty`/`notEmpty` treat `null`, `undefined` and `''` as empty.
 */

import type { CellValue } from './types.js';

export interface CfStyle {
  background?: string;
  color?: string;
  bold?: boolean;
  icon?: string;
}

export type CfRule =
  | { kind: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'; value: number | string; style: CfStyle }
  | { kind: 'between'; min: number; max: number; style: CfStyle }
  | { kind: 'contains'; text: string; style: CfStyle }
  | { kind: 'empty' | 'notEmpty'; style: CfStyle };

/** Coerce a cell value to a finite number, or `null` if it cannot. */
function toNumber(value: CellValue): number | null {
  if (value === null) {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Is the value considered empty (`null`/`undefined`/`''`)? */
function isEmpty(value: CellValue): boolean {
  return value === null || value === undefined || value === '';
}

/** Does a single rule match the given cell value? */
export function ruleMatches(value: CellValue, rule: CfRule): boolean {
  switch (rule.kind) {
    case 'eq':
    case 'ne': {
      let equal: boolean;
      if (typeof rule.value === 'number') {
        const n = toNumber(value);
        equal = n !== null && n === rule.value;
      } else {
        equal = String(value) === rule.value;
      }
      return rule.kind === 'eq' ? equal : !equal;
    }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const n = toNumber(value);
      if (n === null) {
        return false;
      }
      const target = Number(rule.value);
      if (!Number.isFinite(target)) {
        return false;
      }
      switch (rule.kind) {
        case 'gt':
          return n > target;
        case 'gte':
          return n >= target;
        case 'lt':
          return n < target;
        default:
          return n <= target;
      }
    }
    case 'between': {
      const n = toNumber(value);
      if (n === null) {
        return false;
      }
      return n >= rule.min && n <= rule.max;
    }
    case 'contains':
      return String(value).toLowerCase().includes(rule.text.toLowerCase());
    case 'empty':
      return isEmpty(value);
    default:
      return !isEmpty(value);
  }
}

/** Return the first matching rule's style, or `null` if none match. */
export function evaluateRules(value: CellValue, rules: readonly CfRule[]): CfStyle | null {
  for (const rule of rules) {
    if (ruleMatches(value, rule)) {
      return rule.style;
    }
  }
  return null;
}

/**
 * Stateful holder for conditional-format rules with change subscription.
 * Keeps the evaluation pure by delegating to {@link evaluateRules}.
 */
export class ConditionalFormatModel {
  private readonly rules: CfRule[] = [];
  private readonly listeners = new Set<() => void>();

  addRule(rule: CfRule): void {
    this.rules.push(rule);
    this.emit();
  }

  getRules(): CfRule[] {
    return [...this.rules];
  }

  clear(): void {
    this.rules.length = 0;
    this.emit();
  }

  styleFor(value: CellValue): CfStyle | null {
    return evaluateRules(value, this.rules);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
