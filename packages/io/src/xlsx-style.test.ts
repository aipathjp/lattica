import { describe, it, expect } from 'vitest';
import { writeStyledXlsx, __styleInternal, type StyledCell } from './xlsx-style.js';
import { readXlsx } from './xlsx-read.js';

const { StyleTable, mergeRef, styledCellXml, styledSheetXml } = __styleInternal;
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('StyleTable', () => {
  it('returns index 0 for no style and de-duplicates identical styles', () => {
    const t = new StyleTable();
    expect(t.styleIndex(undefined)).toBe(0);
    const a = t.styleIndex({ bold: true });
    const b = t.styleIndex({ bold: true });
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
  });

  it('de-duplicates repeated number formats and fills', () => {
    const t = new StyleTable();
    // Same numFmt across two different styles -> one numFmt entry reused.
    t.styleIndex({ numFmt: '0.0', bold: true });
    t.styleIndex({ numFmt: '0.0', italic: true });
    // Same fill across two different styles -> one fill entry reused.
    t.styleIndex({ bgColor: 'AABBCC', bold: true });
    t.styleIndex({ bgColor: 'AABBCC', italic: true });
    const xml = t.toXml();
    expect(xml).toContain('<numFmts count="1">');
    // 2 default fills + 1 custom = 3.
    expect(xml).toContain('<fills count="3">');
  });

  it('assigns distinct indices for distinct styles', () => {
    const t = new StyleTable();
    const bold = t.styleIndex({ bold: true });
    const fill = t.styleIndex({ bgColor: 'FFEE00' });
    const fmt = t.styleIndex({ numFmt: '#,##0.00' });
    expect(new Set([bold, fill, fmt]).size).toBe(3);
  });

  it('emits styleSheet XML with numFmts, fonts, fills, and cellXfs', () => {
    const t = new StyleTable();
    t.styleIndex({ numFmt: '0.0%', bold: true, italic: true, fontColor: 'FF0000', bgColor: 'EEEEEE', align: 'right' });
    const xml = t.toXml();
    expect(xml).toContain('<numFmt numFmtId="164" formatCode="0.0%"/>');
    expect(xml).toContain('<b/>');
    expect(xml).toContain('<i/>');
    expect(xml).toContain('<color rgb="FFFF0000"/>');
    expect(xml).toContain('patternType="solid"');
    expect(xml).toContain('<alignment horizontal="right"/>');
    expect(xml).toContain('applyNumberFormat="1"');
  });

  it('omits the numFmts block when no custom formats are used', () => {
    const t = new StyleTable();
    t.styleIndex({ bold: true });
    expect(t.toXml()).not.toContain('<numFmts');
  });
});

describe('styledCellXml', () => {
  const ref = 'A1';
  it('skips a blank unstyled cell but keeps a blank styled cell', () => {
    expect(styledCellXml(ref, { value: null }, 0)).toBe('');
    expect(styledCellXml(ref, { value: '' }, 0)).toBe('');
    expect(styledCellXml(ref, { value: null }, 3)).toBe('<c r="A1" s="3"/>');
  });
  it('writes numbers, booleans, and strings with the style index', () => {
    expect(styledCellXml(ref, { value: 42 }, 2)).toBe('<c r="A1" s="2"><v>42</v></c>');
    expect(styledCellXml(ref, { value: true }, 0)).toBe('<c r="A1" t="b"><v>1</v></c>');
    expect(styledCellXml(ref, { value: 'a&b' }, 1)).toContain('t="inlineStr"');
    expect(styledCellXml(ref, { value: 'a&b' }, 1)).toContain('a&amp;b');
  });
  it('writes a false boolean as 0', () => {
    expect(styledCellXml(ref, { value: false }, 0)).toBe('<c r="A1" t="b"><v>0</v></c>');
  });
  it('omits non-finite numbers', () => {
    expect(styledCellXml(ref, { value: Infinity }, 1)).toBe('');
  });
});

describe('mergeRef', () => {
  it('builds an A1:B2 style reference', () => {
    expect(mergeRef({ row: 0, col: 0, rowspan: 2, colspan: 2 })).toBe('A1:B2');
    expect(mergeRef({ row: 2, col: 1, rowspan: 1, colspan: 3 })).toBe('B3:D3');
  });
});

describe('styledSheetXml', () => {
  it('includes a mergeCells block when merges are present', () => {
    const rows: StyledCell[][] = [[{ value: 'hi' }]];
    const xml = styledSheetXml(
      { name: 'S', rows, merges: [{ row: 0, col: 0, rowspan: 1, colspan: 2 }] },
      new StyleTable(),
    );
    expect(xml).toContain('<mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells>');
  });
  it('omits mergeCells when there are none', () => {
    const xml = styledSheetXml({ name: 'S', rows: [[{ value: 1 }]] }, new StyleTable());
    expect(xml).not.toContain('mergeCells');
  });
});

describe('writeStyledXlsx', () => {
  it('throws on an empty workbook', () => {
    expect(() => writeStyledXlsx({ sheets: [] })).toThrow(/at least one sheet/);
  });

  it('produces a package containing styles.xml and the style/merge XML', () => {
    const rows: StyledCell[][] = [
      [{ value: 'Item' }, { value: 'Price', style: { bold: true } }],
      [{ value: 'Widget' }, { value: 9.99, style: { numFmt: '$#,##0.00', bgColor: 'D8F5D0' } }],
    ];
    const bytes = writeStyledXlsx({
      sheets: [{ name: 'Sales', rows, merges: [{ row: 0, col: 0, rowspan: 1, colspan: 2 }] }],
    });
    const text = decode(bytes);
    expect(text).toContain('xl/styles.xml');
    expect(text).toContain('formatCode="$#,##0.00"');
    expect(text).toContain('patternType="solid"');
    expect(text).toContain('<mergeCell ref="A1:B1"/>');
    // The styles relationship is wired into the workbook rels.
    expect(text).toContain('relationships/styles');
  });

  it('falls back to a default name for a blank sheet name', () => {
    const bytes = writeStyledXlsx({ sheets: [{ name: '   ', rows: [[{ value: 1 }]] }] });
    expect(decode(bytes)).toContain('name="Sheet1"');
  });

  it('round-trips cell values through readXlsx', () => {
    const rows: StyledCell[][] = [
      [{ value: 'A' }, { value: 1, style: { bold: true } }],
      [{ value: 'B' }, { value: 2.5, style: { numFmt: '0.0' } }],
    ];
    const bytes = writeStyledXlsx({ sheets: [{ name: 'S', rows }] });
    const wb = readXlsx(bytes);
    expect(wb.sheets[0]!.name).toBe('S');
    expect(wb.sheets[0]!.rows[0]).toEqual(['A', 1]);
    expect(wb.sheets[0]!.rows[1]).toEqual(['B', 2.5]);
  });
});
