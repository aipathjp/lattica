/**
 * Fractional indexing — generates string "order keys" that sort
 * lexicographically and can always be subdivided, so rows/columns can be
 * inserted between any two neighbors without renumbering the rest.
 *
 * Keys use a base-62 digit alphabet. {@link keyBetween} returns a key strictly
 * between its two bounds (either of which may be `null` for "before the first"
 * or "after the last"). Keys are only ever produced through this function
 * starting from `keyBetween(null, null)`, so the minimum digit `0` is never
 * generated and every key remains infinitely subdividable on both sides.
 */

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length;

function digitValue(ch: string): number {
  const v = DIGITS.indexOf(ch);
  if (v < 0) {
    throw new RangeError(`invalid order-key digit: "${ch}"`);
  }
  return v;
}

/** Validate that a string is a well-formed order key. */
export function isOrderKey(key: string): boolean {
  return key.length > 0 && [...key].every((ch) => DIGITS.includes(ch));
}

/**
 * Return an order key strictly between `a` and `b`.
 * `a === null` means "before everything"; `b === null` means "after everything".
 * Requires `a < b` lexicographically when both are provided.
 */
export function keyBetween(a: string | null, b: string | null): string {
  if (a !== null && b !== null && a >= b) {
    throw new RangeError(`lower bound "${a}" must be < upper bound "${b}"`);
  }

  const lower = a ?? '';
  let upper = b;
  let result = '';
  let i = 0;

  for (;;) {
    const da = i < lower.length ? digitValue(lower[i]!) : 0;
    const db = upper !== null && i < upper.length ? digitValue(upper[i]!) : BASE;
    const mid = Math.floor((da + db) / 2);

    if (mid !== da) {
      return result + DIGITS[mid];
    }
    // da and db are equal or adjacent: fix this digit to `da` and recurse,
    // dropping the upper bound (anything greater than `lower`'s tail works).
    result += DIGITS[da];
    upper = da === db ? upper : null;
    i++;
  }
}

/**
 * Generate `count` evenly-spaced keys between `a` and `b` (each strictly
 * ordered). Useful for bulk-inserting rows.
 */
export function keysBetween(a: string | null, b: string | null, count: number): string[] {
  if (count <= 0) {
    return [];
  }
  if (count === 1) {
    return [keyBetween(a, b)];
  }
  const mid = keyBetween(a, b);
  const left = keysBetween(a, mid, Math.floor((count - 1) / 2));
  const right = keysBetween(mid, b, Math.ceil((count - 1) / 2));
  return [...left, mid, ...right];
}
