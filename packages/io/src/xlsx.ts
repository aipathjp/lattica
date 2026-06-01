/**
 * Dependency-free XLSX (OOXML SpreadsheetML) export.
 *
 * Produces a minimal but valid `.xlsx` that Excel, Google Sheets, and LibreOffice
 * open: `[Content_Types].xml`, package + workbook relationships, a workbook part,
 * and one worksheet part per sheet. Strings are written inline (`t="inlineStr"`),
 * numbers as numeric values, and booleans as `t="b"`. Built on the stored-ZIP
 * writer in {@link ./zip}, so no third-party code is involved.
 */

import { columnIndexToLabel } from '@lattica/core';
import { buildZip, type ZipEntry } from './zip.js';

export type XlsxCell = string | number | boolean | null;

export interface XlsxSheet {
  name: string;
  rows: ReadonlyArray<ReadonlyArray<XlsxCell>>;
}

export interface XlsxWorkbook {
  sheets: readonly XlsxSheet[];
}

const encoder = new TextEncoder();

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Excel forbids these characters in sheet names: \ / ? * [ ] : */
function sanitizeSheetName(name: string, index: number): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31);
  return cleaned === '' ? `Sheet${index + 1}` : cleaned;
}

function cellXml(ref: string, value: XlsxCell): string {
  if (value === null || value === '') {
    return '';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `<c r="${ref}"><v>${value}</v></c>` : '';
  }
  if (typeof value === 'boolean') {
    return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

function sheetXml(sheet: XlsxSheet): string {
  const rowsXml = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => cellXml(`${columnIndexToLabel(c)}${r + 1}`, value))
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${rowsXml}</sheetData></worksheet>`
  );
}

function contentTypesXml(sheetCount: number): string {
  const overrides = Array.from(
    { length: sheetCount },
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ` +
      `ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ` +
    `ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `${overrides}</Types>`
  );
}

function rootRelsXml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" ` +
    `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" ` +
    `Target="xl/workbook.xml"/></Relationships>`
  );
}

function workbookXml(sheets: readonly XlsxSheet[]): string {
  const sheetEls = sheets
    .map(
      (sheet, i) =>
        `<sheet name="${xmlEscape(sanitizeSheetName(sheet.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    )
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>${sheetEls}</sheets></workbook>`
  );
}

function workbookRelsXml(sheetCount: number): string {
  const rels = Array.from(
    { length: sheetCount },
    (_, i) =>
      `<Relationship Id="rId${i + 1}" ` +
      `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ` +
      `Target="worksheets/sheet${i + 1}.xml"/>`,
  ).join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `${rels}</Relationships>`
  );
}

/** Serialize a workbook to a `.xlsx` byte array. */
export function writeXlsx(workbook: XlsxWorkbook): Uint8Array {
  if (workbook.sheets.length === 0) {
    throw new RangeError('workbook must contain at least one sheet');
  }
  const text = (s: string): Uint8Array => encoder.encode(s);
  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: text(contentTypesXml(workbook.sheets.length)) },
    { name: '_rels/.rels', data: text(rootRelsXml()) },
    { name: 'xl/workbook.xml', data: text(workbookXml(workbook.sheets)) },
    { name: 'xl/_rels/workbook.xml.rels', data: text(workbookRelsXml(workbook.sheets.length)) },
    ...workbook.sheets.map((sheet, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: text(sheetXml(sheet)),
    })),
  ];
  return buildZip(entries);
}

/** Build a single-sheet workbook from a matrix — a common convenience. */
export function matrixToXlsx(rows: ReadonlyArray<ReadonlyArray<XlsxCell>>, sheetName = 'Sheet1'): Uint8Array {
  return writeXlsx({ sheets: [{ name: sheetName, rows }] });
}

/** Exposed for tests/inspection: the worksheet XML for a single sheet. */
export const __internal = { sheetXml, workbookXml, contentTypesXml, sanitizeSheetName, cellXml };
