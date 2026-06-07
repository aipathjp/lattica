# @lattica/io

Import/export and clipboard interop for Lattica, with no runtime dependencies.
It includes an RFC 4180 delimited-text (CSV/TSV) codec, clipboard text/HTML
helpers, and a from-scratch XLSX reader and writer (built on an embedded
ZIP/deflate implementation). Everything operates on plain string/value matrices
so it stays decoupled from the grid models.

## Install

```sh
pnpm add @lattica/io
```

## API overview

### CSV / TSV

`parseDelimited` / `serializeDelimited` follow RFC 4180 quoting; `parseTsv` /
`serializeTsv` are tab-delimited shortcuts.

```ts
import { parseDelimited, serializeDelimited, parseTsv } from '@lattica/io';

const rows = parseDelimited('name,age\n"Doe, J",42'); // [['name','age'],['Doe, J','42']]
const csv = serializeDelimited(rows);                  // back to a CSV string
const tsv = parseTsv('a\tb\nc\td');
```

`DelimitedOptions` lets you override the `delimiter` and `quote` characters.

### Clipboard

```ts
import { toClipboardText, toClipboardHtml, parseClipboard } from '@lattica/io';

const text = toClipboardText([['a', 'b'], ['c', 'd']]); // TSV for the clipboard
const html = toClipboardHtml([['a', 'b']]);             // an HTML <table>
const matrix = parseClipboard({ text, html });          // prefers HTML when present
```

### XLSX write

Build a workbook from cell matrices (`XlsxCell` = `string | number | boolean | null`).

```ts
import { writeXlsx, matrixToXlsx, type XlsxWorkbook } from '@lattica/io';

const bytes = matrixToXlsx([['Name', 'Qty'], ['Widget', 3]], 'Sheet1');

const workbook: XlsxWorkbook = {
  sheets: [{ name: 'Data', rows: [['a', 1], ['b', 2]] }],
};
const wbBytes = writeXlsx(workbook); // Uint8Array
```

### XLSX read

```ts
import { readXlsx, type ReadWorkbook } from '@lattica/io';

const wb: ReadWorkbook = readXlsx(bytes);
wb.sheets[0]?.name;
wb.sheets[0]?.rows; // (string | number | boolean | null)[][]
```

Low-level building blocks (`crc32`, `buildZip`, `inflateRaw`, `parseHtmlTable`)
are also exported for advanced use.
