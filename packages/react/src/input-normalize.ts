/**
 * Full-width (zenkaku) numeric input handling for number/time columns.
 *
 * Japanese IMEs frequently leave users typing full-width digits (１２３),
 * signs (＋－．) and colons (：) into numeric fields. Taible normalizes those
 * to their ASCII equivalents on the commit path by default so `１，２３４．５`
 * stores the number 1234.5 instead of opaque text. Columns can opt into
 * rejecting such input instead (emitting an `inputreject` event) or turning
 * the handling off entirely via {@link FullWidthMode}.
 */

/**
 * Per-column policy for full-width numeric characters on the commit path:
 * - `'normalize'` (default for `number`/`time` columns) — convert to half-width.
 * - `'reject'` — refuse the commit and emit an `inputreject` event.
 * - `'off'` — leave the text untouched.
 */
export type FullWidthMode = 'reject' | 'normalize' | 'off';

/** Full-width digits ０-９ plus the numeric symbols ．，－−＋：. */
const FULL_WIDTH_CHAR = /[０-９．，－−＋：]/;
const FULL_WIDTH_CHAR_G = /[０-９．，－−＋：]/g;

/** Symbol translations that are not a uniform code-point offset. */
const SYMBOL_MAP = new Map<string, string>([
  ['．', '.'], // U+FF0E fullwidth full stop
  ['，', ','], // U+FF0C fullwidth comma
  ['－', '-'], // U+FF0D fullwidth hyphen-minus
  ['−', '-'], // U+2212 minus sign (common IME output)
  ['＋', '+'], // U+FF0B fullwidth plus
  ['：', ':'], // U+FF1A fullwidth colon
]);

/**
 * Does the text contain any full-width numeric character (digits ０-９ or the
 * numeric symbols ．，－−＋：)?
 */
export function hasFullWidthNumeric(text: string): boolean {
  return FULL_WIDTH_CHAR.test(text);
}

/**
 * Convert every full-width numeric character to its half-width equivalent.
 * Non-numeric characters (including other full-width text) are left as-is.
 */
export function normalizeFullWidth(text: string): string {
  return text.replace(
    FULL_WIDTH_CHAR_G,
    (ch) => SYMBOL_MAP.get(ch) ?? String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  );
}
