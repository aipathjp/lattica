/** Input helpers for the built-in `time` cell type. */

/**
 * Optional behaviors for the `time` column input pipeline, enabled per column
 * via `GridController.setColumnType(col, 'time', options)`.
 */
export interface TimeInputOptions {
  /**
   * Accept decimal hours in addition to clock times: `"1.5"` is kept verbatim
   * (stored as the number 1.5) while `"16:13"`/`"1613"` are normalized to
   * `HH:MM`. Digit-only input without a decimal point is always treated as a
   * clock time (`"18"` → `"18:00"`).
   */
  timeOrDecimalHours?: boolean;
  /**
   * Absorb Excel time serials: a decimal strictly between 0 and 1 (e.g.
   * `"0.5"`, typically pasted from Excel) is converted to `"HH:MM"` via
   * {@link excelTimeSerialToHhMm}. Takes priority over `timeOrDecimalHours`
   * for values in that range.
   */
  excelTimeSerial?: boolean;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

// A decimal number with a fractional part ("1.5", "0.5", ".25").
const DECIMAL_INPUT = /^\d*\.\d+$/;

export function sanitizeTimeDraft(draft: string): string {
  return draft.replace(/[^0-9:]/g, '');
}

/** Draft sanitizer for `time` columns that also accept decimals (`.`). */
export function sanitizeFlexibleTimeDraft(draft: string): string {
  return draft.replace(/[^0-9:.]/g, '');
}

/**
 * Convert an Excel time serial (a fraction of a day, `0 < serial < 1`) to
 * `"HH:MM"`, rounding to the nearest minute (`0.5` → `"12:00"`). Values
 * rounding up to a full day wrap to `"00:00"`. Returns null for anything
 * outside the open interval (0, 1).
 */
export function excelTimeSerialToHhMm(serial: number): string | null {
  if (!Number.isFinite(serial) || serial <= 0 || serial >= 1) {
    return null;
  }
  const totalMinutes = Math.round(serial * 1440) % 1440;
  return `${pad2(Math.floor(totalMinutes / 60))}:${pad2(totalMinutes % 60)}`;
}

/**
 * Normalize `time` input honoring {@link TimeInputOptions}. Decimal input
 * (contains a `.`) is resolved by the enabled modes — Excel serial first for
 * `0 < x < 1`, then decimal hours verbatim — and rejected when no mode
 * accepts it. Everything else goes through {@link normalizeTimeInput}.
 */
export function normalizeFlexibleTimeInput(raw: string, options: TimeInputOptions = {}): string | null {
  const text = raw.trim();
  if (DECIMAL_INPUT.test(text)) {
    const value = Number(text);
    if (options.excelTimeSerial === true && value > 0 && value < 1) {
      return excelTimeSerialToHhMm(value);
    }
    if (options.timeOrDecimalHours === true) {
      return text;
    }
    return null;
  }
  return normalizeTimeInput(text);
}

export function normalizeTimeInput(raw: string): string | null {
  const text = raw.trim();
  if (text === '') {
    return null;
  }

  let hour: number;
  let minute: number;
  const colon = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (colon !== null) {
    hour = Number(colon[1]);
    minute = Number(colon[2]);
  } else if (/^\d{1,2}$/.test(text)) {
    hour = Number(text);
    minute = 0;
  } else if (/^\d{3}$/.test(text)) {
    hour = Number(text.slice(0, 1));
    minute = Number(text.slice(1));
  } else if (/^\d{4}$/.test(text)) {
    hour = Number(text.slice(0, 2));
    minute = Number(text.slice(2));
  } else {
    return null;
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
