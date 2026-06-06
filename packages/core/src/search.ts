/**
 * Pure search model for the Lattica grid.
 *
 * {@link searchGrid} scans a `rowCount x colCount` space in row-major order via
 * a caller-supplied text accessor, returning every matching cell. Matching
 * supports case-insensitive (default) / case-sensitive substring, whole-cell
 * equality, and regular-expression modes. An invalid regular expression is
 * treated as "no matches" rather than throwing, so the model never crashes on
 * partial user input.
 *
 * {@link SearchState} holds an ordered match list plus a cursor that cycles
 * forward/backward with wrap-around, and notifies subscribers on every change.
 * Everything here is framework-agnostic and free of DOM/runtime dependencies.
 */

/** A single matching cell, addressed by zero-based row/col. */
export interface SearchMatch {
  readonly row: number;
  readonly col: number;
}

/** Options controlling how {@link searchGrid} compares cell text. */
export interface SearchOptions {
  /** Match case exactly. Defaults to `false` (case-insensitive). */
  caseSensitive?: boolean;
  /** Require the entire cell text to match, not just a substring. */
  wholeCell?: boolean;
  /** Interpret `query` as a regular expression. */
  regex?: boolean;
}

/**
 * Scan a `rowCount x colCount` grid in row-major order and return every cell
 * whose text matches `query` under `options`.
 *
 * - An empty `query` returns `[]`.
 * - With `regex`, an invalid pattern returns `[]` (never throws).
 * - `caseSensitive` defaults to `false`.
 * - `wholeCell` requires the full cell text to match (whole-string for substring
 *   mode, anchored `^…$` for regex mode).
 */
export function searchGrid(
  rowCount: number,
  colCount: number,
  getText: (row: number, col: number) => string,
  query: string,
  options: SearchOptions = {},
): SearchMatch[] {
  if (query === '') {
    return [];
  }

  const caseSensitive = options.caseSensitive ?? false;
  const wholeCell = options.wholeCell ?? false;
  const useRegex = options.regex ?? false;

  const predicate = useRegex
    ? buildRegexPredicate(query, caseSensitive, wholeCell)
    : buildSubstringPredicate(query, caseSensitive, wholeCell);

  if (predicate === null) {
    return [];
  }

  const matches: SearchMatch[] = [];
  for (let row = 0; row < rowCount; row++) {
    for (let col = 0; col < colCount; col++) {
      if (predicate(getText(row, col))) {
        matches.push({ row, col });
      }
    }
  }
  return matches;
}

type TextPredicate = (text: string) => boolean;

function buildSubstringPredicate(
  query: string,
  caseSensitive: boolean,
  wholeCell: boolean,
): TextPredicate {
  if (caseSensitive) {
    return wholeCell ? (text) => text === query : (text) => text.includes(query);
  }
  const needle = query.toLowerCase();
  return wholeCell
    ? (text) => text.toLowerCase() === needle
    : (text) => text.toLowerCase().includes(needle);
}

/** Build a regex predicate, or `null` if the pattern fails to compile. */
function buildRegexPredicate(
  query: string,
  caseSensitive: boolean,
  wholeCell: boolean,
): TextPredicate | null {
  const source = wholeCell ? `^(?:${query})$` : query;
  const flags = caseSensitive ? '' : 'i';
  let re: RegExp;
  try {
    re = new RegExp(source, flags);
  } catch {
    return null;
  }
  return (text) => re.test(text);
}

/**
 * Holds an ordered match list and a wrap-around cursor over it.
 *
 * `activeIndex` is `0` when matches are present and `-1` when empty. {@link next}
 * and {@link prev} advance the cursor cyclically and return the now-active
 * match. Subscribers registered via {@link subscribe} are notified whenever the
 * match list or cursor changes.
 */
export class SearchState {
  private matches: SearchMatch[] = [];
  private index = -1;
  private readonly listeners = new Set<() => void>();

  /** Replace the match list; resets the cursor to `0` (or `-1` if empty). */
  setMatches(matches: SearchMatch[]): void {
    this.matches = matches.slice();
    this.index = matches.length > 0 ? 0 : -1;
    this.notify();
  }

  /** Number of current matches. */
  get count(): number {
    return this.matches.length;
  }

  /** Index of the active match, or `-1` when there are no matches. */
  get activeIndex(): number {
    return this.index;
  }

  /** Advance forward with wrap-around and return the now-active match. */
  next(): SearchMatch | null {
    if (this.matches.length === 0) {
      return null;
    }
    this.index = (this.index + 1) % this.matches.length;
    this.notify();
    return this.matches[this.index]!;
  }

  /** Advance backward with wrap-around and return the now-active match. */
  prev(): SearchMatch | null {
    if (this.matches.length === 0) {
      return null;
    }
    this.index = (this.index - 1 + this.matches.length) % this.matches.length;
    this.notify();
    return this.matches[this.index]!;
  }

  /** The currently-active match, or `null` when there are no matches. */
  current(): SearchMatch | null {
    if (this.index < 0) {
      return null;
    }
    return this.matches[this.index]!;
  }

  /** Drop all matches and reset the cursor to `-1`. */
  clear(): void {
    this.matches = [];
    this.index = -1;
    this.notify();
  }

  /** Register a change listener. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}
