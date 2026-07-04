/**
 * Input helpers for the built-in `elapsed` cell type — durations such as
 * machine run time or man-hours. Unlike the wall-clock `time` type, hours are
 * unbounded (`"30:15"` is 30 hours 15 minutes). Values are stored as `"H:MM"`
 * (or `"H:MM:SS"` when seconds were entered) and displayed as `"HH:MM"` under
 * 24 hours or `"d:HH:MM"` from 24 hours up (`"30:15"` → `"1:06:15"`).
 */

/** A parsed elapsed-time value. `seconds` is null when not entered. */
export interface ElapsedTime {
  hours: number;
  minutes: number;
  seconds: number | null;
}

const ELAPSED_PATTERN = /^(\d+):(\d{2})(?::(\d{2}))?$/;

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Keep only digits and colons while typing into an `elapsed` cell. */
export function sanitizeElapsedDraft(draft: string): string {
  return draft.replace(/[^0-9:]/g, '');
}

/**
 * Parse `"H:MM"` / `"H:MM:SS"` into its components. Hours are unbounded;
 * minutes and seconds must be two digits in 00-59. Returns null when the text
 * is not a valid elapsed time.
 */
export function parseElapsedTime(text: string): ElapsedTime | null {
  const match = ELAPSED_PATTERN.exec(text.trim());
  if (match === null) {
    return null;
  }
  const minutes = Number(match[2]);
  const seconds = match[3] === undefined ? null : Number(match[3]);
  if (minutes > 59 || (seconds !== null && seconds > 59)) {
    return null;
  }
  return { hours: Number(match[1]), minutes, seconds };
}

/**
 * Normalize user input to the canonical storage form: `"H:MM"` (hours without
 * leading zeros) or `"H:MM:SS"` when seconds were entered. Returns null for
 * invalid input so the commit is cancelled.
 */
export function normalizeElapsedInput(raw: string): string | null {
  const parsed = parseElapsedTime(raw);
  if (parsed === null) {
    return null;
  }
  const base = `${parsed.hours}:${pad2(parsed.minutes)}`;
  return parsed.seconds === null ? base : `${base}:${pad2(parsed.seconds)}`;
}

/**
 * Format a stored elapsed time for display: `"HH:MM"` under 24 hours,
 * `"d:HH:MM"` from 24 hours up (`"30:15"` → `"1:06:15"`), with `":SS"`
 * appended when the stored value carries seconds. Text that is not a valid
 * elapsed time is returned unchanged.
 */
export function formatElapsedDisplay(value: string): string {
  const parsed = parseElapsedTime(value);
  if (parsed === null) {
    return value;
  }
  const suffix = parsed.seconds === null ? '' : `:${pad2(parsed.seconds)}`;
  if (parsed.hours < 24) {
    return `${pad2(parsed.hours)}:${pad2(parsed.minutes)}${suffix}`;
  }
  const days = Math.floor(parsed.hours / 24);
  return `${days}:${pad2(parsed.hours % 24)}:${pad2(parsed.minutes)}${suffix}`;
}
