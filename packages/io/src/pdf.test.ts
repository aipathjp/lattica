import { describe, it, expect } from 'vitest';
import { tableToPdf } from './pdf.js';

const decode = (b: Uint8Array) => new TextDecoder('latin1').decode(b);

/** Count "N 0 obj" object definitions in the PDF. */
function countObjects(text: string): number {
  return (text.match(/\d+ 0 obj/g) ?? []).length;
}

describe('tableToPdf', () => {
  it('produces a valid PDF header, font, xref, and trailer', () => {
    const pdf = tableToPdf([
      ['Name', 'Qty'],
      ['Widget', '10'],
    ]);
    const text = decode(pdf);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/BaseFont /Helvetica');
    expect(text).toContain('xref');
    expect(text).toContain('startxref');
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    // single page: catalog, pages, font, 1 page, 1 content = 5 objects.
    expect(countObjects(text)).toBe(5);
    // cell text is present in a content stream.
    expect(text).toContain('(Widget) Tj');
  });

  it('paginates large tables into multiple page objects', () => {
    const rows = Array.from({ length: 200 }, (_, i) => [`r${i}`, String(i)]);
    const pdf = tableToPdf(rows, { pageHeight: 200, margin: 20, fontSize: 10 });
    const text = decode(pdf);
    const pageCount = (text.match(/\/Type \/Page[^s]/g) ?? []).length;
    expect(pageCount).toBeGreaterThan(1);
    // /Count reflects the page count.
    expect(text).toMatch(/\/Count [2-9]\d*/);
  });

  it('renders a title when provided', () => {
    const text = decode(tableToPdf([['a']], { title: 'My Report' }));
    expect(text).toContain('(My Report) Tj');
  });

  it('escapes PDF-special characters and folds non-Latin-1 to ?', () => {
    const text = decode(tableToPdf([['a(b)c\\d', '日本語']]));
    expect(text).toContain('a\\(b\\)c\\\\d');
    expect(text).toContain('(???) Tj'); // 3 CJK chars -> ???
  });

  it('honours explicit column widths', () => {
    const pdf = tableToPdf(
      [
        ['a', 'b'],
        ['c', 'd'],
      ],
      { colWidths: [100, 200] },
    );
    expect(decode(pdf)).toContain('%PDF-1.4');
  });

  it('falls back gracefully when fewer column widths than columns are given', () => {
    const text = decode(
      tableToPdf(
        [
          ['a', 'b', 'c'],
          ['d', 'e', 'f'],
        ],
        { colWidths: [100] }, // shorter than the 3 columns
      ),
    );
    expect(text).toContain('%PDF-1.4');
    expect(text).toContain('(c) Tj'); // cells beyond the provided widths still render
  });

  it('handles an empty table (one blank page)', () => {
    const text = decode(tableToPdf([]));
    expect(countObjects(text)).toBe(5); // still a valid single-page doc
    expect(text).toContain('/Count 1');
  });
});
