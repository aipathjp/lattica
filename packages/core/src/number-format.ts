/**
 * Excel-style number format strings. A pragmatic, clean-room subset that covers
 * the common cases: digit placeholders (`0` required, `#` optional), thousands
 * grouping (`,`), a decimal point, a leading currency/literal prefix, a trailing
 * literal suffix, and percent (`%`, which scales the value by 100).
 *
 * Examples:
 *   formatNumber(1234.5, '#,##0.00')  -> '1,234.50'
 *   formatNumber(0.1234, '0.0%')      -> '12.3%'
 *   formatNumber(-5, '$#,##0')        -> '-$5'
 *   formatNumber(42, '0 "pcs"')       -> '42 pcs'  (quoted literal)
 */

/** Parsed representation of a number format pattern. */
export interface ParsedFormat {
  prefix: string;
  suffix: string;
  useGrouping: boolean;
  intMin: number;
  fracMin: number;
  fracMax: number;
  percent: boolean;
}

/** Strip surrounding/inner double-quoted literals to plain text. */
function unquote(s: string): string {
  return s.replace(/"([^"]*)"/g, '$1');
}

/** Parse a format pattern into its components. */
export function parseFormat(pattern: string): ParsedFormat {
  const percent = pattern.includes('%');
  // Locate the contiguous digit-placeholder body (first..last of # 0 , .).
  let first = -1;
  let last = -1;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === '#' || ch === '0' || ch === ',' || ch === '.') {
      if (first === -1) {
        first = i;
      }
      last = i;
    }
  }
  if (first === -1) {
    // No digit tokens: treat the whole pattern as a literal suffix.
    return { prefix: '', suffix: unquote(pattern), useGrouping: false, intMin: 1, fracMin: 0, fracMax: 0, percent };
  }
  const prefix = unquote(pattern.slice(0, first));
  const body = pattern.slice(first, last + 1);
  const suffix = unquote(pattern.slice(last + 1));

  const dot = body.indexOf('.');
  const intPart = dot === -1 ? body : body.slice(0, dot);
  const fracPart = dot === -1 ? '' : body.slice(dot + 1);

  const useGrouping = intPart.includes(',');
  const intMin = (intPart.match(/0/g) ?? []).length;
  const fracMin = (fracPart.match(/0/g) ?? []).length;
  const fracMax = (fracPart.match(/[0#]/g) ?? []).length;

  return { prefix, suffix, useGrouping, intMin: Math.max(intMin, 1), fracMin, fracMax, percent };
}

/** Insert thousands separators into a run of integer digits. */
function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format `value` with an Excel-style `pattern`. Non-finite values are returned
 * via `String(value)` unchanged.
 */
export function formatNumber(value: number, pattern: string): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  const f = parseFormat(pattern);
  const scaled = f.percent ? value * 100 : value;
  const negative = scaled < 0;
  const abs = Math.abs(scaled);

  // Round to the maximum fractional digits, then split.
  const fixed = abs.toFixed(f.fracMax);
  const [intRaw, fracRaw = ''] = fixed.split('.');

  // Integer: pad to the minimum digit count, optionally grouped.
  let intStr = intRaw!.replace(/^0+(?=\d)/, ''); // drop leading zeros (keep one)
  if (intStr.length < f.intMin) {
    intStr = intStr.padStart(f.intMin, '0');
  }
  if (f.useGrouping) {
    intStr = group(intStr);
  }

  // Fraction: trim trailing zeros down to the minimum required digit count.
  let fracStr = fracRaw;
  while (fracStr.length > f.fracMin && fracStr.endsWith('0')) {
    fracStr = fracStr.slice(0, -1);
  }

  const sign = negative ? '-' : '';
  const num = fracStr.length > 0 ? `${intStr}.${fracStr}` : intStr;
  return `${sign}${f.prefix}${num}${f.suffix}`;
}
