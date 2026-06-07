/** @lattica/io — import/export and clipboard interop for Lattica. */

export {
  parseDelimited,
  serializeDelimited,
  parseTsv,
  serializeTsv,
  type DelimitedOptions,
} from './delimited.js';
export {
  toClipboardText,
  toClipboardHtml,
  parseClipboard,
  parseHtmlTable,
} from './clipboard.js';
export { crc32, buildZip, type ZipEntry } from './zip.js';
export {
  writeXlsx,
  matrixToXlsx,
  type XlsxCell,
  type XlsxSheet,
  type XlsxWorkbook,
} from './xlsx.js';
export {
  writeStyledXlsx,
  type CellStyle,
  type StyledCell,
  type StyledSheet,
  type StyledWorkbook,
  type XlsxMerge,
} from './xlsx-style.js';
export { tableToPdf, type PdfTableOptions } from './pdf.js';
export { inflateRaw } from './inflate.js';
export { readXlsx, type ReadSheet, type ReadWorkbook } from './xlsx-read.js';
export {
  matrixToJson,
  jsonToMatrix,
  recordsToMatrix,
  matrixToRecords,
  type RecordsResult,
} from './json.js';
