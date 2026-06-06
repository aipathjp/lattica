/**
 * Pure autofill SERIES detection and extension.
 *
 * Powers the fill-handle UX: given a seed selection of cells, classify it as a
 * {@link SeriesKind} and synthesize the next `count` values that continue it.
 *
 * Four kinds are recognized, in priority order:
 * - `numeric`: at least two numbers forming an arithmetic progression with a
 *   constant delta. Extension continues the delta (delta `0` for a single value).
 * - `date`: ISO `yyyy-mm-dd` strings forming an arithmetic progression by whole
 *   days. Extension adds days (handling month/year rollover via UTC math).
 * - `weekday`: a sequence of weekday names (3-letter or full, case-insensitive)
 *   read from a fixed Mon..Sun table. Extension cycles through the week.
 * - `copy`: anything else. Extension repeats the seed cyclically.
 *
 * All functions are pure and side-effect free.
 */

import type { CellValue } from './types.js';

/** The kinds of fill series Lattica can detect from a seed selection. */
export type SeriesKind = 'numeric' | 'date' | 'weekday' | 'copy';

/** Canonical weekday labels, Monday-first, used for output. */
const WEEKDAY_FULL = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

/** Lowercase lookup from both 3-letter and full weekday names to a 0..6 index. */
const WEEKDAY_INDEX: ReadonlyMap<string, number> = new Map(
  WEEKDAY_FULL.flatMap((name, index) => [
    [name.toLowerCase(), index] as const,
    [name.slice(0, 3).toLowerCase(), index] as const,
  ]),
);

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse a value as a finite number, or `null` when it is not a plain number. */
function asNumber(value: CellValue): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Parse a strict ISO `yyyy-mm-dd` string to a UTC epoch-ms, or `null`. */
function asIsoDate(value: CellValue): number | null {
  if (typeof value !== 'string') {
    return null;
  }
  const match = ISO_DATE_PATTERN.exec(value);
  if (match === null) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ms = Date.UTC(year, month - 1, day);
  const d = new Date(ms);
  // Reject impossible dates (e.g. 2026-02-30 normalizes to a different day).
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return ms;
}

/** Map a weekday name (3-letter/full, any case) to a 0..6 index, or `null`. */
function asWeekday(value: CellValue): number | null {
  if (typeof value !== 'string') {
    return null;
  }
  const index = WEEKDAY_INDEX.get(value.trim().toLowerCase());
  return index === undefined ? null : index;
}

/** Format a UTC epoch-ms back to an ISO `yyyy-mm-dd` string. */
function formatIsoDate(ms: number): string {
  const d = new Date(ms);
  const year = String(d.getUTCFullYear()).padStart(4, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Check whether `nums` is an arithmetic progression and return its delta.
 * Requires at least two values; the delta is taken from the last two and every
 * adjacent pair must match it. Returns `null` when not a progression.
 */
function arithmeticDelta(nums: readonly number[]): number | null {
  if (nums.length < 2) {
    return null;
  }
  const delta = nums[nums.length - 1]! - nums[nums.length - 2]!;
  for (let i = 1; i < nums.length; i++) {
    if (nums[i]! - nums[i - 1]! !== delta) {
      return null;
    }
  }
  return delta;
}

/** Map each seed value through `parse`; return the parsed list or `null` if any fails. */
function parseAll<T>(
  seed: readonly CellValue[],
  parse: (value: CellValue) => T | null,
): T[] | null {
  const out: T[] = [];
  for (const value of seed) {
    const parsed = parse(value);
    if (parsed === null) {
      return null;
    }
    out.push(parsed);
  }
  return out;
}

/**
 * Classify a seed selection into a {@link SeriesKind}.
 *
 * An empty seed is `copy`. Detection priority is numeric → date → weekday →
 * copy. Single-value seeds never form a progression, so a lone number/date
 * falls through to `copy` (ambiguous), while a lone weekday is still `weekday`.
 */
export function detectSeries(seed: readonly CellValue[]): SeriesKind {
  if (seed.length === 0) {
    return 'copy';
  }

  const nums = parseAll(seed, asNumber);
  if (nums !== null && arithmeticDelta(nums) !== null) {
    return 'numeric';
  }

  // A constant epoch-ms delta is equivalently a constant whole-day delta.
  const dates = parseAll(seed, asIsoDate);
  if (dates !== null && arithmeticDelta(dates) !== null) {
    return 'date';
  }

  const weekdays = parseAll(seed, asWeekday);
  if (weekdays !== null) {
    return 'weekday';
  }

  return 'copy';
}

/**
 * Extend a numeric arithmetic progression by `count` values.
 * `nums` is guaranteed by {@link detectSeries} to have length >= 2.
 */
function extendNumeric(nums: readonly number[], count: number): CellValue[] {
  const delta = nums[nums.length - 1]! - nums[nums.length - 2]!;
  let current = nums[nums.length - 1]!;
  const out: CellValue[] = [];
  for (let i = 0; i < count; i++) {
    current += delta;
    out.push(current);
  }
  return out;
}

/**
 * Extend an ISO-date by-day progression by `count` values.
 * `dates` is guaranteed by {@link detectSeries} to have length >= 2.
 */
function extendDate(dates: readonly number[], count: number): CellValue[] {
  const deltaMs = dates[dates.length - 1]! - dates[dates.length - 2]!;
  let current = dates[dates.length - 1]!;
  const out: CellValue[] = [];
  for (let i = 0; i < count; i++) {
    current += deltaMs;
    out.push(formatIsoDate(current));
  }
  return out;
}

/** Extend a weekday sequence cyclically by `count` values, in canonical full form. */
function extendWeekday(weekdays: readonly number[], count: number): CellValue[] {
  let current = weekdays[weekdays.length - 1]!;
  const out: CellValue[] = [];
  for (let i = 0; i < count; i++) {
    current = (current + 1) % 7;
    out.push(WEEKDAY_FULL[current]!);
  }
  return out;
}

/** Repeat the seed cyclically to produce `count` values. */
function extendCopy(seed: readonly CellValue[], count: number): CellValue[] {
  const out: CellValue[] = [];
  for (let i = 0; i < count; i++) {
    out.push(seed[i % seed.length]!);
  }
  return out;
}

/**
 * Produce the next `count` values that continue the series detected in `seed`.
 *
 * - Empty seed or `count <= 0` → `[]`.
 * - `numeric`: continues the constant delta (delta `0` for a single value).
 * - `date`: adds the day-delta, with month/year rollover.
 * - `weekday`: cycles Mon..Sun, emitting canonical full names.
 * - `copy`: repeats the seed cyclically.
 */
export function extendSeries(seed: readonly CellValue[], count: number): CellValue[] {
  if (seed.length === 0 || count <= 0) {
    return [];
  }

  switch (detectSeries(seed)) {
    case 'numeric':
      return extendNumeric(parseAll(seed, asNumber)!, count);
    case 'date':
      return extendDate(parseAll(seed, asIsoDate)!, count);
    case 'weekday':
      return extendWeekday(parseAll(seed, asWeekday)!, count);
    case 'copy':
      return extendCopy(seed, count);
  }
}
