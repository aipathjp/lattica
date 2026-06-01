import { describe, it, expect } from 'vitest';
import { writeXlsx, matrixToXlsx, __internal } from './xlsx.js';

const { cellXml, sanitizeSheetName, sheetXml, workbookXml, contentTypesXml } = __internal;

describe('cellXml', () => {
  it('omits null and empty-string cells', () => {
    expect(cellXml('A1', null)).toBe('');
    expect(cellXml('A1', '')).toBe('');
  });
  it('writes numbers as numeric values', () => {
    expect(cellXml('A1', 42)).toBe('<c r="A1"><v>42</v></c>');
  });
  it('omits non-finite numbers', () => {
    expect(cellXml('A1', Infinity)).toBe('');
    expect(cellXml('A1', NaN)).toBe('');
  });
  it('writes booleans with t="b"', () => {
    expect(cellXml('A1', true)).toBe('<c r="A1" t="b"><v>1</v></c>');
    expect(cellXml('A1', false)).toBe('<c r="A1" t="b"><v>0</v></c>');
  });
  it('writes inline strings and escapes XML', () => {
    expect(cellXml('A1', 'a<b>&"c')).toContain('a&lt;b&gt;&amp;&quot;c');
    expect(cellXml('A1', 'x')).toContain('t="inlineStr"');
  });
});

describe('sanitizeSheetName', () => {
  it('strips forbidden characters', () => {
    expect(sanitizeSheetName('a/b:c*d', 0)).toBe('a b c d');
  });
  it('truncates to 31 characters', () => {
    expect(sanitizeSheetName('x'.repeat(40), 0)).toHaveLength(31);
  });
  it('falls back to a default for empty names', () => {
    expect(sanitizeSheetName('', 2)).toBe('Sheet3');
    expect(sanitizeSheetName('///', 0)).toBe('Sheet1');
  });
});

describe('sheetXml', () => {
  it('emits rows and cells with A1 references', () => {
    const xml = sheetXml({ name: 'S', rows: [['a', 1], [true, null]] });
    expect(xml).toContain('<row r="1">');
    expect(xml).toContain('r="A1"');
    expect(xml).toContain('r="B1"');
    expect(xml).toContain('<row r="2">');
    expect(xml).toContain('r="A2" t="b"');
  });
});

describe('workbookXml / contentTypesXml', () => {
  it('lists each sheet with a relationship id', () => {
    const xml = workbookXml([{ name: 'One', rows: [] }, { name: 'Two', rows: [] }]);
    expect(xml).toContain('r:id="rId1"');
    expect(xml).toContain('r:id="rId2"');
    expect(xml).toContain('name="One"');
  });
  it('declares an override per worksheet', () => {
    const xml = contentTypesXml(2);
    expect(xml).toContain('/xl/worksheets/sheet1.xml');
    expect(xml).toContain('/xl/worksheets/sheet2.xml');
  });
});

describe('writeXlsx', () => {
  it('produces a ZIP package containing the OOXML parts', () => {
    const bytes = writeXlsx({ sheets: [{ name: 'Data', rows: [['x', 1]] }] });
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x50, 0x4b]); // "PK"
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('[Content_Types].xml');
    expect(text).toContain('xl/workbook.xml');
    expect(text).toContain('xl/worksheets/sheet1.xml');
    expect(text).toContain('_rels/.rels');
  });

  it('throws when there are no sheets', () => {
    expect(() => writeXlsx({ sheets: [] })).toThrow(RangeError);
  });

  it('writes one worksheet part per sheet', () => {
    const bytes = writeXlsx({
      sheets: [
        { name: 'A', rows: [] },
        { name: 'B', rows: [] },
      ],
    });
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('sheet1.xml');
    expect(text).toContain('sheet2.xml');
  });

  it('matrixToXlsx wraps a single sheet', () => {
    const bytes = matrixToXlsx([['a', 'b']], 'My Sheet');
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('name="My Sheet"');
  });
});
