/**
 * Delimited-text (CSV / TSV) parsing and serialization, following RFC 4180
 * quoting rules: fields containing the delimiter, a quote, CR, or LF are
 * wrapped in double quotes, and embedded quotes are doubled.
 *
 * The parser is a single-pass state machine that handles quoted fields with
 * embedded newlines and `""` escapes, and normalizes CRLF / CR / LF line
 * endings. All values are strings — numeric/boolean coercion is a concern of
 * the layer above.
 */

export interface DelimitedOptions {
  /** Field delimiter. Default `,` (use `\t` for TSV). */
  delimiter?: string;
  /** Quote character. Default `"`. */
  quote?: string;
}

/** Parse delimited text into a row-major array of string cells. */
export function parseDelimited(text: string, options: DelimitedOptions = {}): string[][] {
  const delimiter = options.delimiter ?? ',';
  const quote = options.quote ?? '"';
  if (delimiter.length !== 1) {
    throw new RangeError('delimiter must be a single character');
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  // Tracks whether the current row has seen any content, so a trailing newline
  // does not produce a spurious empty final row.
  let started = false;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    started = false;
  };

  while (i < n) {
    const ch = text[i]!;

    if (inQuotes) {
      if (ch === quote) {
        if (text[i + 1] === quote) {
          field += quote;
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === quote) {
      inQuotes = true;
      started = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      started = true;
      endField();
      i++;
      continue;
    }
    if (ch === '\r') {
      // Treat CRLF and lone CR as one line break.
      endRow();
      if (text[i + 1] === '\n') {
        i += 2;
      } else {
        i++;
      }
      continue;
    }
    if (ch === '\n') {
      endRow();
      i++;
      continue;
    }
    field += ch;
    started = true;
    i++;
  }

  // Flush the final field/row unless the input ended exactly on a newline.
  if (started || field.length > 0 || row.length > 0) {
    endRow();
  }
  return rows;
}

/** Serialize a row-major matrix into delimited text. */
export function serializeDelimited(rows: ReadonlyArray<readonly string[]>, options: DelimitedOptions = {}): string {
  const delimiter = options.delimiter ?? ',';
  const quote = options.quote ?? '"';
  const needsQuoting = (value: string): boolean =>
    value.includes(delimiter) ||
    value.includes(quote) ||
    value.includes('\n') ||
    value.includes('\r');

  const escapeField = (value: string): string => {
    if (!needsQuoting(value)) {
      return value;
    }
    const escaped = value.split(quote).join(quote + quote);
    return `${quote}${escaped}${quote}`;
  };

  return rows.map((row) => row.map(escapeField).join(delimiter)).join('\r\n');
}

/** Convenience: parse TSV (tab-separated). */
export function parseTsv(text: string): string[][] {
  return parseDelimited(text, { delimiter: '\t' });
}

/** Convenience: serialize to TSV. */
export function serializeTsv(rows: ReadonlyArray<readonly string[]>): string {
  return serializeDelimited(rows, { delimiter: '\t' });
}
