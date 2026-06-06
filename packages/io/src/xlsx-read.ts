/**
 * Dependency-free XLSX (OOXML SpreadsheetML) reader.
 *
 * Parses a `.xlsx` byte array back into sheets and dense cell matrices, the
 * inverse of {@link ./xlsx writeXlsx}. The ZIP container is decoded by reading
 * the end-of-central-directory record and central headers to locate entries by
 * name, then each entry's local header; STORED entries are sliced directly and
 * DEFLATE entries are decompressed via {@link ./inflate inflateRaw}. No
 * third-party (or `node:zlib`) code is involved, keeping the package free of any
 * platform/runtime dependency.
 *
 * The OOXML side is parsed with a small string-scanning XML reader (no DOM, no
 * deps): workbook relationships order the worksheets, an optional shared-strings
 * table resolves `t="s"` cells, and each worksheet's `<c>`/`<v>`/`<is>` elements
 * are read into a matrix sized to the maximum referenced cell, with gaps filled
 * by `null`.
 */

import { columnLabelToIndex } from '@lattica/core';
import { inflateRaw } from './inflate.js';

/** A single decoded worksheet: its name and a dense row-major value matrix. */
export interface ReadSheet {
  name: string;
  rows: (string | number | boolean | null)[][];
}

/** A decoded workbook: sheets in workbook (tab) order. */
export interface ReadWorkbook {
  sheets: ReadSheet[];
}

const decoder = new TextDecoder();

/* ----------------------------------------------------------------------------
 * ZIP container decoding
 * ------------------------------------------------------------------------- */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

interface CentralEntry {
  name: string;
  method: number;
  compressedSize: number;
  localOffset: number;
}

/** Find the end-of-central-directory record, scanning backwards for its signature. */
function findEocd(view: DataView, bytes: Uint8Array): number {
  // EOCD is at least 22 bytes; comment length is usually 0, so scan from the end.
  const minPos = Math.max(0, bytes.length - 22 - 0xffff);
  for (let pos = bytes.length - 22; pos >= minPos; pos--) {
    if (view.getUint32(pos, true) === EOCD_SIGNATURE) {
      return pos;
    }
  }
  throw new Error('xlsx: not a zip file (no end-of-central-directory record)');
}

/** Parse the central directory into a map of entry name -> header info. */
function readCentralDirectory(bytes: Uint8Array): Map<string, CentralEntry> {
  if (bytes.length < 22) {
    throw new Error('xlsx: not a zip file (too small)');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(view, bytes);
  const total = view.getUint16(eocd + 10, true);
  let pos = view.getUint32(eocd + 16, true);

  const entries = new Map<string, CentralEntry>();
  for (let i = 0; i < total; i++) {
    if (view.getUint32(pos, true) !== CENTRAL_SIGNATURE) {
      throw new Error('xlsx: corrupt central directory header');
    }
    const method = view.getUint16(pos + 10, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
    entries.set(name, { name, method, compressedSize, localOffset });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Extract and (if needed) inflate a single entry's bytes from its local header. */
function readEntry(bytes: Uint8Array, entry: CentralEntry): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const off = entry.localOffset;
  if (view.getUint32(off, true) !== LOCAL_SIGNATURE) {
    throw new Error('xlsx: corrupt local file header');
  }
  const nameLen = view.getUint16(off + 26, true);
  const extraLen = view.getUint16(off + 28, true);
  const dataStart = off + 30 + nameLen + extraLen;
  const compressed = bytes.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.method === 0) {
    return compressed;
  }
  if (entry.method === 8) {
    return inflateRaw(compressed);
  }
  throw new Error(`xlsx: unsupported compression method ${entry.method}`);
}

/* ----------------------------------------------------------------------------
 * Tiny XML string-scanning helpers
 * ------------------------------------------------------------------------- */

/** Decode the standard XML entities (and numeric char refs) in text content. */
function xmlUnescape(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (_, body: string) => {
    switch (body) {
      case 'amp':
        return '&';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      default: {
        // Numeric character reference: &#NN; or &#xHH;
        const code =
          body[1] === 'x' || body[1] === 'X'
            ? parseInt(body.slice(2), 16)
            : parseInt(body.slice(1), 10);
        return String.fromCodePoint(code);
      }
    }
  });
}

/** Read an attribute value from a start-tag fragment, or undefined if absent. */
function getAttr(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return match ? xmlUnescape(match[1]!) : undefined;
}

/* ----------------------------------------------------------------------------
 * OOXML parsing
 * ------------------------------------------------------------------------- */

/** Parse `xl/sharedStrings.xml` into an ordered array of plain strings. */
function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  // Each <si>...</si> is one shared string; concatenate all its <t> runs.
  const siRegex = /<si\b[^>]*\/>|<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRegex.exec(xml)) !== null) {
    const inner = m[1];
    if (inner === undefined) {
      // Self-closing empty <si/>.
      strings.push('');
      continue;
    }
    let text = '';
    const tRegex = /<t\b[^>]*\/>|<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let t: RegExpExecArray | null;
    while ((t = tRegex.exec(inner)) !== null) {
      text += t[1] === undefined ? '' : xmlUnescape(t[1]);
    }
    strings.push(text);
  }
  return strings;
}

/** Map of workbook relationship id -> worksheet part path (relative to xl/). */
function parseWorkbookRels(xml: string): Map<string, string> {
  const rels = new Map<string, string>();
  const relRegex = /<Relationship\b[^>]*\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = relRegex.exec(xml)) !== null) {
    const tag = m[0]!;
    const id = getAttr(tag, 'Id');
    const target = getAttr(tag, 'Target');
    if (id !== undefined && target !== undefined) {
      rels.set(id, target);
    }
  }
  return rels;
}

interface WorkbookSheet {
  name: string;
  relId: string;
}

/** Read the ordered `<sheet>` list from `xl/workbook.xml`. */
function parseWorkbook(xml: string): WorkbookSheet[] {
  const sheets: WorkbookSheet[] = [];
  const sheetRegex = /<sheet\b[^>]*\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = sheetRegex.exec(xml)) !== null) {
    const tag = m[0]!;
    const name = getAttr(tag, 'name') ?? '';
    // r:id is the relationship reference; fall back to a bare id attribute.
    const relId = getAttr(tag, 'r:id') ?? getAttr(tag, 'id') ?? '';
    sheets.push({ name, relId });
  }
  return sheets;
}

/** Resolve a single `<c>` cell element into a typed value. */
function parseCellValue(cellXml: string, openTag: string, shared: string[]): string | number | boolean | null {
  const type = getAttr(openTag, 't');

  if (type === 'inlineStr') {
    // <is><t>...</t></is>, possibly multiple <t> runs.
    let text = '';
    const tRegex = /<t\b[^>]*\/>|<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let t: RegExpExecArray | null;
    while ((t = tRegex.exec(cellXml)) !== null) {
      text += t[1] === undefined ? '' : xmlUnescape(t[1]);
    }
    return text;
  }

  const vMatch = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(cellXml);
  if (vMatch === null) {
    // No value element (e.g. <c r="A1"/>): treat as empty.
    return null;
  }
  const raw = xmlUnescape(vMatch[1]!);

  if (type === 's') {
    const index = Number(raw);
    const resolved = shared[index];
    return resolved === undefined ? '' : resolved;
  }
  if (type === 'b') {
    return raw === '1' || raw === 'true';
  }
  if (type === 'str') {
    return raw;
  }
  // default (no type or t="n"): numeric.
  return Number(raw);
}

/** Parse a single worksheet XML part into a dense value matrix. */
function parseWorksheet(xml: string, shared: string[]): (string | number | boolean | null)[][] {
  // Collect cells as { row, col, value } first, then size the dense matrix.
  interface ParsedCell {
    row: number;
    col: number;
    value: string | number | boolean | null;
  }
  const cells: ParsedCell[] = [];
  let maxRow = -1;
  let maxCol = -1;

  // Match both <c .../> (self-closing) and <c ...>...</c>.
  const cRegex = /<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g;
  let m: RegExpExecArray | null;
  while ((m = cRegex.exec(xml)) !== null) {
    const attrs = m[1]!;
    const openTag = `<c${attrs}>`;
    const ref = getAttr(openTag, 'r');
    /* v8 ignore next 3 -- writer always emits r=; defensive for foreign files */
    if (ref === undefined) {
      continue;
    }
    const cellMatch = /^([A-Za-z]+)(\d+)$/.exec(ref);
    /* v8 ignore next 3 -- malformed reference; defensive for foreign files */
    if (cellMatch === null) {
      continue;
    }
    const col = columnLabelToIndex(cellMatch[1]!);
    const row = Number(cellMatch[2]!) - 1;
    const body = m[3] ?? '';
    const value = parseCellValue(body, openTag, shared);
    cells.push({ row, col, value });
    if (row > maxRow) maxRow = row;
    if (col > maxCol) maxCol = col;
  }

  if (maxRow < 0) {
    return [];
  }
  const matrix: (string | number | boolean | null)[][] = [];
  for (let r = 0; r <= maxRow; r++) {
    matrix.push(new Array<string | number | boolean | null>(maxCol + 1).fill(null));
  }
  for (const cell of cells) {
    matrix[cell.row]![cell.col] = cell.value;
  }
  return matrix;
}

/* ----------------------------------------------------------------------------
 * Entry point
 * ------------------------------------------------------------------------- */

/** Read a `.xlsx` byte array into a {@link ReadWorkbook}. */
export function readXlsx(bytes: Uint8Array): ReadWorkbook {
  const entries = readCentralDirectory(bytes);

  const workbookEntry = entries.get('xl/workbook.xml');
  if (workbookEntry === undefined) {
    throw new Error('xlsx: missing xl/workbook.xml');
  }
  const workbookXml = decoder.decode(readEntry(bytes, workbookEntry));
  const sheetDefs = parseWorkbook(workbookXml);

  const relsEntry = entries.get('xl/_rels/workbook.xml.rels');
  const rels =
    relsEntry === undefined
      ? new Map<string, string>()
      : parseWorkbookRels(decoder.decode(readEntry(bytes, relsEntry)));

  const sharedEntry = entries.get('xl/sharedStrings.xml');
  const shared =
    sharedEntry === undefined ? [] : parseSharedStrings(decoder.decode(readEntry(bytes, sharedEntry)));

  const sheets: ReadSheet[] = [];
  for (const def of sheetDefs) {
    const target = rels.get(def.relId);
    // Relationship targets are relative to xl/; normalize to a package path.
    const partPath = target === undefined ? undefined : `xl/${target.replace(/^\/?/, '')}`;
    const sheetEntry = partPath === undefined ? undefined : entries.get(partPath);
    if (sheetEntry === undefined) {
      // Sheet declared but its part is absent: emit an empty sheet.
      sheets.push({ name: def.name, rows: [] });
      continue;
    }
    const sheetXml = decoder.decode(readEntry(bytes, sheetEntry));
    sheets.push({ name: def.name, rows: parseWorksheet(sheetXml, shared) });
  }

  return { sheets };
}
