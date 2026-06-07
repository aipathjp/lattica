/**
 * Dependency-free PDF export — renders a string table to a minimal but valid
 * PDF 1.4 document (Helvetica, WinAnsi text, ruled grid, automatic pagination).
 * No third-party code: objects are assembled by hand with a byte-accurate xref
 * table. Text is limited to Latin-1 (the standard-14 Helvetica encoding); any
 * non-Latin-1 character is replaced with `?` since font embedding is out of
 * scope.
 */

export interface PdfTableOptions {
  title?: string;
  fontSize?: number;
  /** Page size in points (default US Letter 612×792). */
  pageWidth?: number;
  pageHeight?: number;
  margin?: number;
  /** Explicit column widths (points); defaults to an equal split. */
  colWidths?: number[];
}

const encoder = new TextEncoder();

/** Escape a string for a PDF literal and fold non-Latin-1 to `?`. */
function pdfText(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    if (ch === '\\' || ch === '(' || ch === ')') {
      out += `\\${ch}`;
    } else if (code < 0x20 || code > 0xff) {
      out += '?';
    } else {
      out += ch;
    }
  }
  return out;
}

/** Render `rows` (a header + data matrix of strings) into a PDF byte array. */
export function tableToPdf(rows: ReadonlyArray<ReadonlyArray<string>>, options: PdfTableOptions = {}): Uint8Array {
  const fontSize = options.fontSize ?? 10;
  const pageW = options.pageWidth ?? 612;
  const pageH = options.pageHeight ?? 792;
  const margin = options.margin ?? 40;
  const title = options.title;

  const ncols = rows.reduce((max, r) => Math.max(max, r.length), 0);
  const contentW = pageW - margin * 2;
  const colWidths =
    options.colWidths ?? Array.from({ length: Math.max(1, ncols) }, () => contentW / Math.max(1, ncols));
  const colX: number[] = [margin];
  for (let i = 0; i < colWidths.length; i++) {
    colX.push(colX[i]! + colWidths[i]!);
  }

  const rowHeight = fontSize * 1.6;
  const titleHeight = title !== undefined ? fontSize * 2.4 : 0;
  const usableTop = pageH - margin - titleHeight;
  const rowsPerPage = Math.max(1, Math.floor((usableTop - margin) / rowHeight));

  // Split rows across pages.
  const pages: ReadonlyArray<ReadonlyArray<string>>[] = [];
  if (rows.length === 0) {
    pages.push([]);
  } else {
    for (let i = 0; i < rows.length; i += rowsPerPage) {
      pages.push(rows.slice(i, i + rowsPerPage));
    }
  }

  /** Build the content stream for one page of rows. */
  const pageContent = (pageRows: ReadonlyArray<ReadonlyArray<string>>): string => {
    const ops: string[] = [];
    let y = pageH - margin;
    if (title !== undefined) {
      ops.push(`BT /F1 ${fontSize * 1.5} Tf 1 0 0 1 ${margin} ${y - fontSize * 1.2} Tm (${pdfText(title)}) Tj ET`);
      y -= titleHeight;
    }
    const tableTop = y;
    pageRows.forEach((row, r) => {
      const rowTop = tableTop - r * rowHeight;
      const textY = rowTop - fontSize;
      row.forEach((cell, c) => {
        const x = (colX[c] ?? margin) + 2;
        ops.push(`BT /F1 ${fontSize} Tf 1 0 0 1 ${x} ${textY} Tm (${pdfText(cell)}) Tj ET`);
      });
      // Rule under the row.
      const lineY = rowTop - rowHeight;
      ops.push(`${margin} ${lineY} m ${margin + contentW} ${lineY} l S`);
    });
    // Top rule + vertical separators spanning the drawn rows.
    const bottom = tableTop - pageRows.length * rowHeight;
    ops.push(`${margin} ${tableTop} m ${margin + contentW} ${tableTop} l S`);
    for (let c = 0; c <= Math.max(1, ncols); c++) {
      const x = colX[c] ?? margin + contentW;
      ops.push(`${x} ${tableTop} m ${x} ${bottom} l S`);
    }
    return ops.join('\n');
  };

  // Assemble objects with byte-accurate offsets.
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const offsets: number[] = [];
  const push = (s: string): void => {
    const b = encoder.encode(s);
    chunks.push(b);
    offset += b.length;
  };
  const obj = (num: number, body: string): void => {
    offsets[num - 1] = offset;
    push(`${num} 0 obj\n${body}\nendobj\n`);
  };

  const P = pages.length;
  const pageObjNum = (i: number): number => 4 + i;
  const contentObjNum = (i: number): number => 4 + P + i;
  const totalObjects = 3 + 2 * P;

  push('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  const kids = pages.map((_, i) => `${pageObjNum(i)} 0 R`).join(' ');
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${P} >>`);
  obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  pages.forEach((_, i) => {
    obj(
      pageObjNum(i),
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
        `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjNum(i)} 0 R >>`,
    );
  });
  pages.forEach((pageRows, i) => {
    const content = pageContent(pageRows);
    const bytes = encoder.encode(content).length;
    obj(contentObjNum(i), `<< /Length ${bytes} >>\nstream\n${content}\nendstream`);
  });

  const xrefStart = offset;
  let xref = `xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`;
  for (let i = 0; i < totalObjects; i++) {
    xref += `${String(offsets[i]!).padStart(10, '0')} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  // Concatenate chunks.
  const out = new Uint8Array(offset);
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}
