/**
 * Schema inference — pure, deterministic helpers for guessing the shape of
 * imported tabular data without any model in the loop.
 *
 * The pipeline is intentionally simple and side-effect free:
 *
 *   - {@link inferCellType} classifies a single raw value into an
 *     {@link InferredType}.
 *   - {@link inferColumnType} reconciles the per-cell types of a column's
 *     sample values into one column-level type, ignoring empties.
 *   - {@link normalizeValue} canonicalizes a raw value for a given type
 *     (trimming, full-width→ASCII digits, numeric/boolean/date coercion).
 *   - {@link detectDuplicateRows} groups near-identical rows using a
 *     normalized trigram Jaccard similarity, so noisy imports can be
 *     deduplicated.
 *
 * Everything here is provider-agnostic and free of I/O, so it is trivially
 * testable to 100% coverage.
 */

/** The set of column/cell types this module can infer. */
export type InferredType = 'integer' | 'number' | 'boolean' | 'date' | 'string' | 'empty';

/** Matches an ISO-ish calendar date: `yyyy-mm-dd` (separators `-` or `/`). */
const DATE_RE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;

/** Map of full-width digit code points to their ASCII equivalents. */
const FULLWIDTH_DIGIT_OFFSET = 0xfee0;

/**
 * Convert any full-width digits (`０`–`９`) in a string to ASCII (`0`–`9`).
 * Other characters pass through untouched.
 */
function fullwidthDigitsToAscii(input: string): string {
  let out = '';
  for (const ch of input) {
    // Iterating a string yields whole code points, so codePointAt(0) is defined.
    /* v8 ignore next -- ?? 0 fallback is unreachable for an iterated character */
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0xff10 && code <= 0xff19) {
      out += String.fromCodePoint(code - FULLWIDTH_DIGIT_OFFSET);
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * True when `s` parses as a finite JS number. Callers pass a non-empty
 * trimmed string; an empty string would yield `Number('') === 0` which we
 * reject explicitly to avoid treating blanks as numeric.
 */
function isNumericString(s: string): boolean {
  /* v8 ignore next 3 -- callers guard against empty strings before calling */
  if (s.length === 0) {
    return false;
  }
  const n = Number(s);
  return Number.isFinite(n);
}

/**
 * Validate that the captured groups of {@link DATE_RE} form a real calendar
 * day (month 1–12, day 1–31). Returns the zero-padded `yyyy-mm-dd` form, or
 * `undefined` when out of range.
 */
function canonicalizeDate(year: string, month: string, day: string): string | undefined {
  const m = Number(month);
  const d = Number(day);
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return undefined;
  }
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/**
 * Classify a single raw value.
 *
 * - `null`/`undefined`/empty-string → `'empty'`
 * - `true`/`false` (boolean or the literal strings) → `'boolean'`
 * - finite numeric (number or numeric string) → `'integer'` if whole, else `'number'`
 * - ISO-ish `yyyy-mm-dd` string → `'date'`
 * - everything else → `'string'`
 */
export function inferCellType(value: unknown): InferredType {
  if (value === null || value === undefined) {
    return 'empty';
  }

  if (typeof value === 'boolean') {
    return 'boolean';
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return 'string';
    }
    return Number.isInteger(value) ? 'integer' : 'number';
  }

  if (typeof value === 'string') {
    const trimmed = fullwidthDigitsToAscii(value.trim());
    if (trimmed.length === 0) {
      return 'empty';
    }
    if (trimmed === 'true' || trimmed === 'false') {
      return 'boolean';
    }
    if (isNumericString(trimmed)) {
      const n = Number(trimmed);
      return Number.isInteger(n) ? 'integer' : 'number';
    }
    const match = DATE_RE.exec(trimmed);
    if (match) {
      // Capture groups are guaranteed present when the regex matches.
      const [, year, month, day] = match;
      /* v8 ignore next 3 -- year/month/day are always captured on a regex match */
      if (year === undefined || month === undefined || day === undefined) {
        return 'string';
      }
      if (canonicalizeDate(year, month, day) !== undefined) {
        return 'date';
      }
    }
    return 'string';
  }

  // Non-primitive (object, array, function, symbol, bigint) → treat as string.
  return 'string';
}

/**
 * Reconcile per-cell types across a column's sample values into one type.
 *
 * Empties are ignored. If every non-empty sample is numeric, the column is
 * `'integer'` when all samples are integers, otherwise `'number'`. Columns
 * whose non-empty samples are uniformly `'boolean'` or `'date'` keep that
 * type. Any other mix yields `'string'`. A column with no non-empty samples
 * is `'empty'`.
 */
export function inferColumnType(samples: readonly unknown[]): InferredType {
  const types: InferredType[] = [];
  for (const sample of samples) {
    const t = inferCellType(sample);
    if (t !== 'empty') {
      types.push(t);
    }
  }

  if (types.length === 0) {
    return 'empty';
  }

  const allNumeric = types.every((t) => t === 'integer' || t === 'number');
  if (allNumeric) {
    return types.every((t) => t === 'integer') ? 'integer' : 'number';
  }

  const allBoolean = types.every((t) => t === 'boolean');
  if (allBoolean) {
    return 'boolean';
  }

  const allDate = types.every((t) => t === 'date');
  if (allDate) {
    return 'date';
  }

  return 'string';
}

/**
 * Canonicalize a raw value for a known {@link InferredType}.
 *
 * - `'empty'` → `null`
 * - `'integer'`/`'number'` → JS `number` (full-width digits handled)
 * - `'boolean'` → JS `boolean`
 * - `'date'` → zero-padded `yyyy-mm-dd` string (or the trimmed input if unparseable)
 * - `'string'` → trimmed string
 */
export function normalizeValue(value: unknown, type: InferredType): unknown {
  if (type === 'empty') {
    return null;
  }

  if (type === 'boolean') {
    if (typeof value === 'boolean') {
      return value;
    }
    const s = typeof value === 'string' ? value.trim().toLowerCase() : String(value).toLowerCase();
    return s === 'true';
  }

  if (type === 'integer' || type === 'number') {
    if (typeof value === 'number') {
      return value;
    }
    const raw = typeof value === 'string' ? value : String(value);
    return Number(fullwidthDigitsToAscii(raw.trim()));
  }

  if (type === 'date') {
    const raw = typeof value === 'string' ? value : String(value);
    const trimmed = fullwidthDigitsToAscii(raw.trim());
    const match = DATE_RE.exec(trimmed);
    if (match) {
      const [, year, month, day] = match;
      /* v8 ignore next 3 -- year/month/day are always captured on a regex match */
      if (year === undefined || month === undefined || day === undefined) {
        return trimmed;
      }
      const canon = canonicalizeDate(year, month, day);
      return canon ?? trimmed;
    }
    return trimmed;
  }

  // 'string'
  const raw = typeof value === 'string' ? value : String(value);
  return raw.trim();
}

/**
 * Build the set of normalized character trigrams for a string. Returns an
 * empty set for inputs shorter than 3 characters after normalization.
 */
function trigrams(s: string): Set<string> {
  const normalized = fullwidthDigitsToAscii(s.trim().toLowerCase());
  const grams = new Set<string>();
  for (let i = 0; i + 3 <= normalized.length; i++) {
    grams.add(normalized.slice(i, i + 3));
  }
  return grams;
}

/** Jaccard similarity of two trigram sets; two empty sets count as identical. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) {
    return 1;
  }
  let intersection = 0;
  for (const g of a) {
    if (b.has(g)) {
      intersection += 1;
    }
  }
  const union = a.size + b.size - intersection;
  // union === 0 only when both sets are empty, already handled above.
  /* v8 ignore next -- union === 0 branch is unreachable after the empty-set guard */
  return union === 0 ? 1 : intersection / union;
}

/**
 * Render a row to the canonical signature used for similarity. When `keyCols`
 * is supplied only those column indices participate; otherwise the whole row
 * is used. Cells are joined with a unit separator that cannot appear in normal
 * text, so distinct cells never bleed together.
 */
function rowSignature(row: readonly string[], keyCols: number[] | undefined): string {
  const cells = keyCols === undefined ? row : keyCols.map((c) => row[c] ?? '');
  return cells.join('');
}

/** Options controlling {@link detectDuplicateRows}. */
export interface DetectDuplicateRowsOptions {
  /** Minimum Jaccard similarity to treat two rows as duplicates. Default 0.9. */
  threshold?: number;
  /** Restrict comparison to these column indices; defaults to the whole row. */
  keyCols?: number[];
}

/**
 * Group near-duplicate rows by normalized trigram Jaccard similarity.
 *
 * Rows are compared pairwise; any pair with similarity `>= threshold` is
 * unioned into the same group. Returns an array of groups, each an array of
 * the original row indices (ascending). Singleton rows (no duplicate partner)
 * are excluded. Groups are returned in ascending order of their smallest
 * member index.
 */
export function detectDuplicateRows(
  rows: readonly (readonly string[])[],
  opts: DetectDuplicateRowsOptions = {},
): number[][] {
  const threshold = opts.threshold ?? 0.9;
  const keyCols = opts.keyCols;

  const signatures = rows.map((row) => trigrams(rowSignature(row, keyCols)));

  // Union-find over row indices.
  const parent = rows.map((_, i) => i);
  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) {
      // parent[root] is always a valid index by construction.
      root = parent[root] as number;
    }
    return root;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent[Math.max(ra, rb)] = Math.min(ra, rb);
    }
  };

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = signatures[i];
      const b = signatures[j];
      /* v8 ignore next 3 -- indices i,j are always in range of signatures */
      if (a === undefined || b === undefined) {
        continue;
      }
      if (jaccard(a, b) >= threshold) {
        union(i, j);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < rows.length; i++) {
    const root = find(i);
    const bucket = groups.get(root);
    if (bucket === undefined) {
      groups.set(root, [i]);
    } else {
      bucket.push(i);
    }
  }

  const result: number[][] = [];
  for (const bucket of groups.values()) {
    if (bucket.length > 1) {
      result.push(bucket);
    }
  }
  result.sort((x, y) => (x[0] as number) - (y[0] as number));
  return result;
}
