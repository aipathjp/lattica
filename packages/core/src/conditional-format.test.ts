import { describe, it, expect, vi } from 'vitest';
import {
  ruleMatches,
  evaluateRules,
  ConditionalFormatModel,
} from './conditional-format.js';
import type { CfRule, CfStyle } from './conditional-format.js';

const S: CfStyle = { background: '#fff', color: '#000', bold: true, icon: '*' };

describe('ruleMatches - eq (numeric)', () => {
  const rule: CfRule = { kind: 'eq', value: 10, style: S };
  it('matches equal number', () => {
    expect(ruleMatches(10, rule)).toBe(true);
  });
  it('matches numeric string that coerces', () => {
    expect(ruleMatches('10', rule)).toBe(true);
  });
  it('does not match different number', () => {
    expect(ruleMatches(11, rule)).toBe(false);
  });
  it('does not match non-numeric value (coercion fails)', () => {
    expect(ruleMatches('abc', rule)).toBe(false);
  });
  it('does not match null', () => {
    expect(ruleMatches(null, rule)).toBe(false);
  });
});

describe('ruleMatches - eq (string)', () => {
  const rule: CfRule = { kind: 'eq', value: 'hi', style: S };
  it('matches identical string', () => {
    expect(ruleMatches('hi', rule)).toBe(true);
  });
  it('does not match different string', () => {
    expect(ruleMatches('bye', rule)).toBe(false);
  });
  it('compares via String(value) for numbers', () => {
    const r: CfRule = { kind: 'eq', value: '5', style: S };
    expect(ruleMatches(5, r)).toBe(true);
  });
});

describe('ruleMatches - ne', () => {
  it('numeric ne true when unequal', () => {
    expect(ruleMatches(1, { kind: 'ne', value: 2, style: S })).toBe(true);
  });
  it('numeric ne false when equal', () => {
    expect(ruleMatches(2, { kind: 'ne', value: 2, style: S })).toBe(false);
  });
  it('numeric ne true when value non-numeric', () => {
    expect(ruleMatches('x', { kind: 'ne', value: 2, style: S })).toBe(true);
  });
  it('string ne true when different', () => {
    expect(ruleMatches('a', { kind: 'ne', value: 'b', style: S })).toBe(true);
  });
  it('string ne false when same', () => {
    expect(ruleMatches('b', { kind: 'ne', value: 'b', style: S })).toBe(false);
  });
});

describe('ruleMatches - gt/gte/lt/lte', () => {
  it('gt true', () => {
    expect(ruleMatches(5, { kind: 'gt', value: 3, style: S })).toBe(true);
  });
  it('gt false', () => {
    expect(ruleMatches(2, { kind: 'gt', value: 3, style: S })).toBe(false);
  });
  it('gte boundary true', () => {
    expect(ruleMatches(3, { kind: 'gte', value: 3, style: S })).toBe(true);
  });
  it('gte false', () => {
    expect(ruleMatches(2, { kind: 'gte', value: 3, style: S })).toBe(false);
  });
  it('lt true', () => {
    expect(ruleMatches(1, { kind: 'lt', value: 3, style: S })).toBe(true);
  });
  it('lt false', () => {
    expect(ruleMatches(5, { kind: 'lt', value: 3, style: S })).toBe(false);
  });
  it('lte boundary true', () => {
    expect(ruleMatches(3, { kind: 'lte', value: 3, style: S })).toBe(true);
  });
  it('lte false', () => {
    expect(ruleMatches(4, { kind: 'lte', value: 3, style: S })).toBe(false);
  });
  it('coerces numeric string cell', () => {
    expect(ruleMatches('5', { kind: 'gt', value: 3, style: S })).toBe(true);
  });
  it('non-numeric cell never matches', () => {
    expect(ruleMatches('abc', { kind: 'gt', value: 3, style: S })).toBe(false);
  });
  it('null cell never matches', () => {
    expect(ruleMatches(null, { kind: 'lt', value: 3, style: S })).toBe(false);
  });
  it('non-numeric rule value never matches', () => {
    expect(ruleMatches(5, { kind: 'gt', value: 'abc', style: S })).toBe(false);
  });
  it('numeric-string rule value coerces and matches', () => {
    expect(ruleMatches(5, { kind: 'gt', value: '3', style: S })).toBe(true);
  });
});

describe('ruleMatches - between', () => {
  const rule: CfRule = { kind: 'between', min: 1, max: 10, style: S };
  it('inside range matches', () => {
    expect(ruleMatches(5, rule)).toBe(true);
  });
  it('min boundary matches', () => {
    expect(ruleMatches(1, rule)).toBe(true);
  });
  it('max boundary matches', () => {
    expect(ruleMatches(10, rule)).toBe(true);
  });
  it('below range does not match', () => {
    expect(ruleMatches(0, rule)).toBe(false);
  });
  it('above range does not match', () => {
    expect(ruleMatches(11, rule)).toBe(false);
  });
  it('coerces numeric string', () => {
    expect(ruleMatches('5', rule)).toBe(true);
  });
  it('non-numeric cell does not match', () => {
    expect(ruleMatches('xyz', rule)).toBe(false);
  });
});

describe('ruleMatches - contains', () => {
  const rule: CfRule = { kind: 'contains', text: 'ell', style: S };
  it('matches substring', () => {
    expect(ruleMatches('hello', rule)).toBe(true);
  });
  it('case-insensitive', () => {
    expect(ruleMatches('HELLO', rule)).toBe(true);
  });
  it('does not match absent substring', () => {
    expect(ruleMatches('world', rule)).toBe(false);
  });
  it('stringifies numbers', () => {
    expect(ruleMatches(12345, { kind: 'contains', text: '234', style: S })).toBe(true);
  });
  it('stringifies null', () => {
    expect(ruleMatches(null, { kind: 'contains', text: 'null', style: S })).toBe(true);
  });
});

describe('ruleMatches - empty/notEmpty', () => {
  const empty: CfRule = { kind: 'empty', style: S };
  const notEmpty: CfRule = { kind: 'notEmpty', style: S };
  it('empty matches null', () => {
    expect(ruleMatches(null, empty)).toBe(true);
  });
  it('empty matches empty string', () => {
    expect(ruleMatches('', empty)).toBe(true);
  });
  it('empty matches undefined', () => {
    expect(ruleMatches(undefined as unknown as null, empty)).toBe(true);
  });
  it('empty does not match non-empty', () => {
    expect(ruleMatches('x', empty)).toBe(false);
  });
  it('empty does not match 0', () => {
    expect(ruleMatches(0, empty)).toBe(false);
  });
  it('notEmpty matches non-empty', () => {
    expect(ruleMatches('x', notEmpty)).toBe(true);
  });
  it('notEmpty does not match null', () => {
    expect(ruleMatches(null, notEmpty)).toBe(false);
  });
  it('notEmpty does not match empty string', () => {
    expect(ruleMatches('', notEmpty)).toBe(false);
  });
});

describe('evaluateRules', () => {
  it('returns first matching rule style (precedence)', () => {
    const first: CfStyle = { background: 'red' };
    const second: CfStyle = { background: 'blue' };
    const rules: CfRule[] = [
      { kind: 'gt', value: 0, style: first },
      { kind: 'gt', value: 5, style: second },
    ];
    expect(evaluateRules(10, rules)).toBe(first);
  });
  it('skips non-matching rule and returns later match', () => {
    const first: CfStyle = { background: 'red' };
    const second: CfStyle = { background: 'blue' };
    const rules: CfRule[] = [
      { kind: 'gt', value: 100, style: first },
      { kind: 'lt', value: 5, style: second },
    ];
    expect(evaluateRules(1, rules)).toBe(second);
  });
  it('returns null when nothing matches', () => {
    const rules: CfRule[] = [{ kind: 'eq', value: 99, style: S }];
    expect(evaluateRules(1, rules)).toBeNull();
  });
  it('returns null for empty rule list', () => {
    expect(evaluateRules(1, [])).toBeNull();
  });
});

describe('ConditionalFormatModel', () => {
  it('addRule and getRules', () => {
    const m = new ConditionalFormatModel();
    const rule: CfRule = { kind: 'eq', value: 1, style: S };
    m.addRule(rule);
    expect(m.getRules()).toEqual([rule]);
  });
  it('getRules returns a copy (not internal array)', () => {
    const m = new ConditionalFormatModel();
    const rule: CfRule = { kind: 'eq', value: 1, style: S };
    m.addRule(rule);
    const a = m.getRules();
    a.push({ kind: 'eq', value: 2, style: S });
    expect(m.getRules()).toHaveLength(1);
  });
  it('clear empties the rules', () => {
    const m = new ConditionalFormatModel();
    m.addRule({ kind: 'eq', value: 1, style: S });
    m.clear();
    expect(m.getRules()).toEqual([]);
  });
  it('styleFor delegates to evaluateRules', () => {
    const m = new ConditionalFormatModel();
    const style: CfStyle = { bold: true };
    m.addRule({ kind: 'gt', value: 0, style });
    expect(m.styleFor(5)).toBe(style);
    expect(m.styleFor(-1)).toBeNull();
  });
  it('subscribe notifies on addRule and clear', () => {
    const m = new ConditionalFormatModel();
    const listener = vi.fn();
    const unsub = m.subscribe(listener);
    m.addRule({ kind: 'eq', value: 1, style: S });
    expect(listener).toHaveBeenCalledTimes(1);
    m.clear();
    expect(listener).toHaveBeenCalledTimes(2);
    unsub();
    m.addRule({ kind: 'eq', value: 2, style: S });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
