/**
 * Clipboard interop. Spreadsheets exchange tabular data as both `text/plain`
 * (TSV) and `text/html` (a `<table>`); Excel, Google Sheets, and Numbers all
 * read either. These helpers build and parse those payloads as pure strings so
 * they are testable without a real clipboard, and so the React layer can wire
 * them to the async Clipboard API.
 */

import { parseTsv, serializeTsv } from './delimited.js';

/** Escape text for safe inclusion in HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Build the `text/plain` (TSV) clipboard payload for a matrix. */
export function toClipboardText(matrix: ReadonlyArray<readonly string[]>): string {
  return serializeTsv(matrix);
}

/** Build a `text/html` `<table>` clipboard payload for a matrix. */
export function toClipboardHtml(matrix: ReadonlyArray<readonly string[]>): string {
  const rows = matrix
    .map((row) => {
      const cells = row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  return `<table><tbody>${rows}</tbody></table>`;
}

/**
 * Parse a pasted clipboard payload into a matrix. Prefers HTML when it contains
 * a table; otherwise falls back to TSV parsing of the plain text.
 */
export function parseClipboard(input: { text?: string; html?: string }): string[][] {
  if (input.html !== undefined && input.html.trim() !== '' && /<t[dr]\b/i.test(input.html)) {
    return parseHtmlTable(input.html);
  }
  if (input.text !== undefined) {
    return parseTsv(input.text);
  }
  return [];
}

/**
 * Minimal HTML-table extractor for clipboard payloads. Handles `<tr>`/`<td>`/
 * `<th>` with attributes, decodes the common entities, and strips inner tags.
 * Intentionally small — clipboard HTML from spreadsheets is well-structured.
 */
export function parseHtmlTable(html: string): string[][] {
  const rows: string[][] = [];
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(html)) !== null) {
    const rowHtml = rowMatch[1]!;
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(rowHtml)) !== null) {
      cells.push(decodeEntities(stripTags(cellMatch[1]!)));
    }
    rows.push(cells);
  }
  return rows;
}

function stripTags(html: string): string {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}
