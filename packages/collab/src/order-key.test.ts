import { describe, it, expect } from 'vitest';
import { keyBetween, keysBetween, isOrderKey } from './order-key.js';

describe('keyBetween', () => {
  it('produces a key between null bounds', () => {
    const k = keyBetween(null, null);
    expect(isOrderKey(k)).toBe(true);
  });

  it('produces a key after a lower bound', () => {
    const a = keyBetween(null, null);
    const after = keyBetween(a, null);
    expect(after > a).toBe(true);
  });

  it('produces a key before an upper bound', () => {
    const b = keyBetween(null, null);
    const before = keyBetween(null, b);
    expect(before < b).toBe(true);
  });

  it('produces a key strictly between two adjacent keys', () => {
    const a = keyBetween(null, null);
    const b = keyBetween(a, null);
    const mid = keyBetween(a, b);
    expect(a < mid).toBe(true);
    expect(mid < b).toBe(true);
  });

  it('can subdivide repeatedly between the same neighbors', () => {
    let lo = keyBetween(null, null);
    const hi = keyBetween(lo, null);
    let prev = lo;
    for (let i = 0; i < 50; i++) {
      const mid = keyBetween(lo, hi);
      expect(lo < mid && mid < hi).toBe(true);
      expect(mid).not.toBe(prev);
      prev = mid;
      lo = mid;
    }
  });

  it('keeps order when appending many keys at the end', () => {
    const keys: string[] = [];
    let last: string | null = null;
    for (let i = 0; i < 100; i++) {
      last = keyBetween(last, null);
      keys.push(last);
    }
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
  });

  it('keeps order when prepending many keys at the start', () => {
    const keys: string[] = [];
    let first: string | null = null;
    for (let i = 0; i < 100; i++) {
      first = keyBetween(null, first);
      keys.unshift(first);
    }
    expect([...keys].sort()).toEqual(keys);
  });

  it('throws when bounds are out of order', () => {
    expect(() => keyBetween('Z', 'A')).toThrow(RangeError);
    expect(() => keyBetween('M', 'M')).toThrow(RangeError);
  });

  it('throws on a bound containing an invalid digit', () => {
    expect(() => keyBetween('!', null)).toThrow(RangeError);
    expect(() => keyBetween(null, '~')).toThrow(RangeError);
  });

  it('handles a prefix relationship between bounds', () => {
    const a = 'V';
    const b = 'VV';
    const mid = keyBetween(a, b);
    expect(a < mid && mid < b).toBe(true);
  });
});

describe('keysBetween', () => {
  it('returns the requested count, strictly ordered', () => {
    const keys = keysBetween(null, null, 10);
    expect(keys).toHaveLength(10);
    expect([...keys].sort()).toEqual(keys);
  });

  it('returns a single key for count 1', () => {
    expect(keysBetween(null, null, 1)).toHaveLength(1);
  });

  it('returns empty for non-positive counts', () => {
    expect(keysBetween(null, null, 0)).toEqual([]);
    expect(keysBetween(null, null, -5)).toEqual([]);
  });

  it('fits all keys between explicit bounds', () => {
    const a = keyBetween(null, null);
    const b = keyBetween(a, null);
    const keys = keysBetween(a, b, 5);
    expect(keys).toHaveLength(5);
    for (const k of keys) {
      expect(a < k && k < b).toBe(true);
    }
    expect([...keys].sort()).toEqual(keys);
  });
});

describe('isOrderKey', () => {
  it('validates keys', () => {
    expect(isOrderKey('V')).toBe(true);
    expect(isOrderKey('')).toBe(false);
    expect(isOrderKey('a-b')).toBe(false);
  });
});
