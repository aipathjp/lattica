/**
 * Validation-rule generation — pure, deterministic helpers that propose a
 * validator spec from sample values and report how well it fits.
 *
 * The pipeline is intentionally simple and side-effect free, mirroring
 * {@link ./schema-infer.js}:
 *
 *   - {@link matchesSpec} tests whether one value satisfies a {@link RuleSpec}.
 *   - {@link fitRate} reports the fraction of non-empty samples a spec accepts.
 *   - {@link suggestRule} walks specs from most- to least-specific and returns
 *     the first whose fit rate clears a threshold, falling back to `'any'`.
 *
 * Everything here is provider-agnostic and free of I/O, so it is trivially
 * testable to 100% coverage. No model is consulted: the proposal is derived
 * purely from the sample values.
 */

/** A proposed validator. Each variant accepts a string cell value. */
export type RuleSpec =
  | { kind: 'number' }
  | { kind: 'integer' }
  | { kind: 'boolean' }
  | { kind: 'email' }
  | { kind: 'enum'; values: string[] }
  | { kind: 'regex'; source: string }
  | { kind: 'any' };

/** Pragmatic email shape: `local@domain.tld`, no spaces. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Recognised boolean literals (case-insensitive). */
const BOOLEAN_LITERALS = new Set(['true', 'false']);

/** True when `s` parses as a finite JS number (callers pass non-empty input). */
function isFiniteNumber(s: string): boolean {
  const n = Number(s);
  return Number.isFinite(n);
}

/**
 * Test whether `value` satisfies `spec`.
 *
 * - `'number'` → any finite numeric string
 * - `'integer'` → finite numeric string that is a whole number
 * - `'boolean'` → `true`/`false` (case-insensitive)
 * - `'email'` → matches {@link EMAIL_RE}
 * - `'enum'` → exact membership of `spec.values`
 * - `'regex'` → matches a `RegExp` built from `spec.source`
 * - `'any'` → always true
 */
export function matchesSpec(spec: RuleSpec, value: string): boolean {
  switch (spec.kind) {
    case 'number':
      return isFiniteNumber(value);
    case 'integer':
      return isFiniteNumber(value) && Number.isInteger(Number(value));
    case 'boolean':
      return BOOLEAN_LITERALS.has(value.toLowerCase());
    case 'email':
      return EMAIL_RE.test(value);
    case 'enum':
      return spec.values.includes(value);
    case 'regex':
      return new RegExp(spec.source).test(value);
    case 'any':
      return true;
  }
}

/**
 * Fraction of non-empty `values` (after trimming) that satisfy `spec`, in
 * `[0, 1]`. Empty/whitespace-only values are ignored. When there are no
 * non-empty values the rate is `1` (vacuously satisfied).
 */
export function fitRate(spec: RuleSpec, values: readonly string[]): number {
  let total = 0;
  let hits = 0;
  for (const raw of values) {
    const value = raw.trim();
    if (value.length === 0) {
      continue;
    }
    total += 1;
    if (matchesSpec(spec, value)) {
      hits += 1;
    }
  }
  if (total === 0) {
    return 1;
  }
  return hits / total;
}

/** Distinct non-empty trimmed values, preserving first-seen order. */
function distinctNonEmpty(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (value.length === 0 || seen.has(value)) {
      continue;
    }
    seen.add(value);
    out.push(value);
  }
  return out;
}

/** Options controlling {@link suggestRule}. */
export interface SuggestRuleOptions {
  /** Minimum fit rate a candidate must reach to be accepted. Default 0.95. */
  minFit?: number;
  /** Largest distinct set still proposed as an `enum`. Default 8. */
  maxEnum?: number;
}

/**
 * Propose the most specific {@link RuleSpec} whose {@link fitRate} over the
 * non-empty `values` is at least `minFit` (default `0.95`).
 *
 * Candidates are tried in priority order — `integer` → `number` → `boolean`
 * → `email` → `enum` — and the first one that clears the threshold wins. The
 * `enum` candidate is only attempted when the distinct non-empty value count
 * is in `[1, maxEnum]` (default `maxEnum` of 8). If nothing qualifies, `'any'`
 * is returned as the fallback (it always fits).
 */
export function suggestRule(values: readonly string[], opts: SuggestRuleOptions = {}): RuleSpec {
  const minFit = opts.minFit ?? 0.95;
  const maxEnum = opts.maxEnum ?? 8;

  const ordered: RuleSpec[] = [{ kind: 'integer' }, { kind: 'number' }, { kind: 'boolean' }, { kind: 'email' }];
  for (const candidate of ordered) {
    if (fitRate(candidate, values) >= minFit) {
      return candidate;
    }
  }

  // When the input is all-empty, every numeric candidate already fits
  // (fitRate is vacuously 1), so this enum path is only reached with at least
  // one distinct non-empty value — the `length <= maxEnum` bound is the only
  // gate that matters here.
  const distinct = distinctNonEmpty(values);
  if (distinct.length <= maxEnum) {
    const enumSpec: RuleSpec = { kind: 'enum', values: distinct };
    if (fitRate(enumSpec, values) >= minFit) {
      return enumSpec;
    }
  }

  return { kind: 'any' };
}
