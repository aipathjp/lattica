/**
 * Styled XLSX (OOXML) export — extends the plain {@link ./xlsx} writer with a
 * `styles.xml` part so exported cells carry number formats, bold/italic, font
 * color, fill color, and horizontal alignment, plus worksheet `mergeCells`.
 *
 * Dependency-free: builds on the stored-ZIP writer in {@link ./zip}. Styles are
 * de-duplicated into a compact style table; each cell references its style by
 * the `s` index Excel expects.
 */

import { columnIndexToLabel } from '@lattica/core';
import { buildZip, type ZipEntry } from './zip.js';
import type { XlsxCell } from './xlsx.js';

/** A per-cell style. Colors are 6-hex `RRGGBB` (no leading `#`). */
export interface CellStyle {
  numFmt?: string;
  bold?: boolean;
  italic?: boolean;
  fontColor?: string;
  bgColor?: string;
  align?: 'left' | 'center' | 'right';
}

export interface StyledCell {
  value: XlsxCell;
  style?: CellStyle;
}

export interface XlsxMerge {
  row: number;
  col: number;
  rowspan: number;
  colspan: number;
}

export interface StyledSheet {
  name: string;
  rows: ReadonlyArray<ReadonlyArray<StyledCell>>;
  merges?: readonly XlsxMerge[];
}

export interface StyledWorkbook {
  sheets: readonly StyledSheet[];
}

const encoder = new TextEncoder();

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeSheetName(name: string, index: number): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31);
  return cleaned === '' ? `Sheet${index + 1}` : cleaned;
}

/** De-duplicating builder for the workbook's shared style table. */
class StyleTable {
  private readonly numFmts = new Map<string, number>();
  private readonly fonts: string[] = ['<font/>'];
  private readonly fontKey = new Map<string, number>();
  private readonly fills: string[] = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
  ];
  private readonly fillKey = new Map<string, number>();
  private readonly xfs: string[] = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  private readonly xfKey = new Map<string, number>();

  private numFmtId(pattern?: string): number {
    if (pattern === undefined) {
      return 0;
    }
    const existing = this.numFmts.get(pattern);
    if (existing !== undefined) {
      return existing;
    }
    const id = 164 + this.numFmts.size;
    this.numFmts.set(pattern, id);
    return id;
  }

  private fontId(s: CellStyle): number {
    if (s.bold !== true && s.italic !== true && s.fontColor === undefined) {
      return 0;
    }
    const key = `${s.bold === true ? 1 : 0}|${s.italic === true ? 1 : 0}|${s.fontColor ?? ''}`;
    const existing = this.fontKey.get(key);
    if (existing !== undefined) {
      return existing;
    }
    let xml = '<font>';
    if (s.bold === true) xml += '<b/>';
    if (s.italic === true) xml += '<i/>';
    if (s.fontColor !== undefined) xml += `<color rgb="FF${s.fontColor}"/>`;
    xml += '</font>';
    const idx = this.fonts.length;
    this.fonts.push(xml);
    this.fontKey.set(key, idx);
    return idx;
  }

  private fillId(bgColor?: string): number {
    if (bgColor === undefined) {
      return 0;
    }
    const existing = this.fillKey.get(bgColor);
    if (existing !== undefined) {
      return existing;
    }
    const idx = this.fills.length;
    this.fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="FF${bgColor}"/></patternFill></fill>`);
    this.fillKey.set(bgColor, idx);
    return idx;
  }

  /** Resolve (and intern) the cell-xf index for a style; 0 for no style. */
  styleIndex(style?: CellStyle): number {
    if (style === undefined) {
      return 0;
    }
    const numFmtId = this.numFmtId(style.numFmt);
    const fontId = this.fontId(style);
    const fillId = this.fillId(style.bgColor);
    const align = style.align;
    const key = `${numFmtId}|${fontId}|${fillId}|${align ?? ''}`;
    const existing = this.xfKey.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const attrs =
      `numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="0" xfId="0"` +
      (numFmtId > 0 ? ' applyNumberFormat="1"' : '') +
      (fontId > 0 ? ' applyFont="1"' : '') +
      (fillId > 0 ? ' applyFill="1"' : '') +
      (align !== undefined ? ' applyAlignment="1"' : '');
    const xf =
      align !== undefined
        ? `<xf ${attrs}><alignment horizontal="${align}"/></xf>`
        : `<xf ${attrs}/>`;
    const idx = this.xfs.length;
    this.xfs.push(xf);
    this.xfKey.set(key, idx);
    return idx;
  }

  toXml(): string {
    const numFmtEls = [...this.numFmts.entries()]
      .map(([p, id]) => `<numFmt numFmtId="${id}" formatCode="${xmlEscape(p)}"/>`)
      .join('');
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      (this.numFmts.size > 0 ? `<numFmts count="${this.numFmts.size}">${numFmtEls}</numFmts>` : '') +
      `<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts>` +
      `<fills count="${this.fills.length}">${this.fills.join('')}</fills>` +
      `<borders count="1"><border/></borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>` +
      `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
      `</styleSheet>`
    );
  }
}

function styledCellXml(ref: string, cell: StyledCell, s: number): string {
  const sAttr = s > 0 ? ` s="${s}"` : '';
  const { value } = cell;
  if (value === null || value === '') {
    // A styled empty cell still needs to exist so its fill/format applies.
    return s > 0 ? `<c r="${ref}"${sAttr}/>` : '';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `<c r="${ref}"${sAttr}><v>${value}</v></c>` : '';
  }
  if (typeof value === 'boolean') {
    return `<c r="${ref}"${sAttr} t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

function mergeRef(m: XlsxMerge): string {
  const start = `${columnIndexToLabel(m.col)}${m.row + 1}`;
  const end = `${columnIndexToLabel(m.col + m.colspan - 1)}${m.row + m.rowspan}`;
  return `${start}:${end}`;
}

function styledSheetXml(sheet: StyledSheet, styles: StyleTable): string {
  const rowsXml = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((cell, c) => styledCellXml(`${columnIndexToLabel(c)}${r + 1}`, cell, styles.styleIndex(cell.style)))
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  const merges = sheet.merges ?? [];
  const mergeXml =
    merges.length > 0
      ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${mergeRef(m)}"/>`).join('')}</mergeCells>`
      : '';
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${rowsXml}</sheetData>${mergeXml}</worksheet>`
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
    `<Override PartName="/xl/styles.xml" ` +
    `ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
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

function workbookXml(sheets: readonly StyledSheet[]): string {
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
  // styles.xml gets the next relationship id after the sheets.
  const stylesRel =
    `<Relationship Id="rId${sheetCount + 1}" ` +
    `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" ` +
    `Target="styles.xml"/>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `${rels}${stylesRel}</Relationships>`
  );
}

/** Serialize a styled workbook to a `.xlsx` byte array. */
export function writeStyledXlsx(workbook: StyledWorkbook): Uint8Array {
  if (workbook.sheets.length === 0) {
    throw new RangeError('workbook must contain at least one sheet');
  }
  const styles = new StyleTable();
  const text = (s: string): Uint8Array => encoder.encode(s);
  const sheetParts = workbook.sheets.map((sheet, i) => ({
    name: `xl/worksheets/sheet${i + 1}.xml`,
    data: text(styledSheetXml(sheet, styles)),
  }));
  // styles.xml is serialized last (after every cell registered its style).
  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: text(contentTypesXml(workbook.sheets.length)) },
    { name: '_rels/.rels', data: text(rootRelsXml()) },
    { name: 'xl/workbook.xml', data: text(workbookXml(workbook.sheets)) },
    { name: 'xl/_rels/workbook.xml.rels', data: text(workbookRelsXml(workbook.sheets.length)) },
    ...sheetParts,
    { name: 'xl/styles.xml', data: text(styles.toXml()) },
  ];
  return buildZip(entries);
}

/** Exposed for tests/inspection. */
export const __styleInternal = { styledSheetXml, StyleTable, mergeRef, styledCellXml };
