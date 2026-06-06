import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { readXlsx } from './xlsx-read.js';
import { writeXlsx, matrixToXlsx } from './xlsx.js';
import { crc32 } from './zip.js';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

/**
 * Build a minimal ZIP from named parts, choosing STORED or DEFLATE per entry.
 * Used to construct fixtures that exercise the method-8 path and edge cases the
 * stored-only writer cannot produce.
 */
function buildZip(parts: ReadonlyArray<{ name: string; data: Uint8Array; deflate?: boolean }>): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const part of parts) {
    const nameBytes = enc(part.name);
    const crc = crc32(part.data);
    const uncompressedSize = part.data.length;
    const method = part.deflate ? 8 : 0;
    const stored = part.deflate ? new Uint8Array(deflateRawSync(part.data)) : part.data;
    const compressedSize = stored.length;

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, method, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, compressedSize, true);
    lv.setUint32(22, uncompressedSize, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    chunks.push(local, stored);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, method, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, compressedSize, true);
    cv.setUint32(24, uncompressedSize, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    central.push(cd);

    offset += local.length + stored.length;
  }

  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, parts.length, true);
  ev.setUint16(10, parts.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const total = chunks.reduce((s, c) => s + c.length, 0) + centralSize + end.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of [...chunks, ...central, end]) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

const CONTENT_TYPES = enc(
  `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
);
const ROOT_RELS = enc(
  `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="xl/workbook.xml"/></Relationships>`,
);

describe('readXlsx round-trips with writeXlsx', () => {
  it('reads strings, numbers, booleans, and null gaps from a single sheet', () => {
    const rows = [
      ['name', 'qty', 'active'],
      ['widget', 12, true],
      ['gadget', 0, false],
      [null, 3.5, null],
    ];
    const bytes = matrixToXlsx(rows, 'Data');
    const wb = readXlsx(bytes);

    expect(wb.sheets).toHaveLength(1);
    expect(wb.sheets[0]!.name).toBe('Data');
    expect(wb.sheets[0]!.rows).toEqual(rows);
  });

  it('preserves multi-sheet order and names', () => {
    const bytes = writeXlsx({
      sheets: [
        { name: 'First', rows: [['a']] },
        { name: 'Second', rows: [[1, 2]] },
        { name: 'Third', rows: [[true]] },
      ],
    });
    const wb = readXlsx(bytes);
    expect(wb.sheets.map((s) => s.name)).toEqual(['First', 'Second', 'Third']);
    expect(wb.sheets[1]!.rows).toEqual([[1, 2]]);
  });

  it('returns an empty matrix for an empty sheet', () => {
    const bytes = matrixToXlsx([], 'Empty');
    const wb = readXlsx(bytes);
    expect(wb.sheets[0]!.rows).toEqual([]);
  });

  it('fills gaps when cells are sparse / rows ragged', () => {
    // Writer omits null and empty-string cells, so this exercises gap filling.
    const rows = [
      ['only-col-A'],
      [null, null, 'col-C-row2'],
    ];
    const bytes = matrixToXlsx(rows, 'Sparse');
    const wb = readXlsx(bytes);
    expect(wb.sheets[0]!.rows).toEqual([
      ['only-col-A', null, null],
      [null, null, 'col-C-row2'],
    ]);
  });

  it('handles escaped XML characters in strings', () => {
    const rows = [['a & b < c > d "q"']];
    const wb = readXlsx(matrixToXlsx(rows, 'X'));
    expect(wb.sheets[0]!.rows).toEqual(rows);
  });
});

describe('readXlsx parses hand-built OOXML fixtures', () => {
  const workbook = enc(
    `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="S1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  const rels = enc(
    `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>`,
  );

  it('resolves the shared-strings path (t="s") incl. numeric &amp; refs', () => {
    // The third <si> mixes a self-closing <t/> with a populated <t> run.
    const sharedStrings = enc(
      `<?xml version="1.0"?><sst><si><t>hello</t></si><si><t/><t xml:space="preserve">w&#111;rld</t></si><si/></sst>`,
    );
    const sheet = enc(
      `<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>99</v></c></row></sheetData></worksheet>`,
    );
    const bytes = buildZip([
      { name: '[Content_Types].xml', data: CONTENT_TYPES },
      { name: '_rels/.rels', data: ROOT_RELS },
      { name: 'xl/workbook.xml', data: workbook, deflate: true },
      { name: 'xl/_rels/workbook.xml.rels', data: rels },
      { name: 'xl/sharedStrings.xml', data: sharedStrings },
      { name: 'xl/worksheets/sheet1.xml', data: sheet, deflate: true },
    ]);
    const wb = readXlsx(bytes);
    // index 99 is out of range -> '' ; <si/> self-closing -> ''
    expect(wb.sheets[0]!.rows).toEqual([['hello', 'world', '', '']]);
  });

  it('parses inlineStr, str, b (true/false/numeric), number, and bare <c/>', () => {
    const sheet = enc(
      `<?xml version="1.0"?><worksheet><sheetData>` +
        `<row r="1">` +
        `<c r="A1" t="inlineStr"><is><t>in</t><t>line</t></is></c>` +
        `<c r="B1" t="str"><v>formula-text</v></c>` +
        `<c r="C1" t="b"><v>1</v></c>` +
        `<c r="D1" t="b"><v>true</v></c>` +
        `<c r="E1" t="b"><v>0</v></c>` +
        `</row>` +
        `<row r="2">` +
        `<c r="A2"><v>42</v></c>` +
        `<c r="B2" t="n"><v>3.14</v></c>` +
        `<c r="C2"/>` +
        `<c r="D2" t="inlineStr"><is><t/></is></c>` +
        `</row>` +
        `</sheetData></worksheet>`,
    );
    const inlineWorkbook = enc(
      `<?xml version="1.0"?><workbook><sheets><sheet name="S1" r:id="rId1"/></sheets></workbook>`,
    );
    const bytes = buildZip([
      { name: 'xl/workbook.xml', data: inlineWorkbook },
      { name: 'xl/_rels/workbook.xml.rels', data: rels },
      { name: 'xl/worksheets/sheet1.xml', data: sheet },
    ]);
    const wb = readXlsx(bytes);
    expect(wb.sheets[0]!.rows).toEqual([
      ['inline', 'formula-text', true, true, false],
      [42, 3.14, null, '', null],
    ]);
  });

  it('emits an empty sheet when the worksheet part or relationship is missing', () => {
    const wbXml = enc(
      `<?xml version="1.0"?><workbook><sheets>` +
        `<sheet name="Ghost" r:id="rIdMissing"/>` +
        `<sheet name="NoPart" r:id="rId1"/>` +
        `</sheets></workbook>`,
    );
    const relsMissingPart = enc(
      `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="x" Target="worksheets/absent.xml"/></Relationships>`,
    );
    const bytes = buildZip([
      { name: 'xl/workbook.xml', data: wbXml },
      { name: 'xl/_rels/workbook.xml.rels', data: relsMissingPart },
    ]);
    const wb = readXlsx(bytes);
    expect(wb.sheets).toEqual([
      { name: 'Ghost', rows: [] },
      { name: 'NoPart', rows: [] },
    ]);
  });

  it('falls back to a bare id attribute and works without a rels part', () => {
    // No workbook.xml.rels present -> rels map empty -> sheet has no part -> empty.
    const wbXml = enc(
      `<?xml version="1.0"?><workbook><sheets><sheet name="Solo" id="rId1"/></sheets></workbook>`,
    );
    const bytes = buildZip([{ name: 'xl/workbook.xml', data: wbXml }]);
    const wb = readXlsx(bytes);
    expect(wb.sheets).toEqual([{ name: 'Solo', rows: [] }]);
  });

  it('handles a sheet with no name and no relationship id', () => {
    const wbXml = enc(`<?xml version="1.0"?><workbook><sheets><sheet/></sheets></workbook>`);
    const bytes = buildZip([{ name: 'xl/workbook.xml', data: wbXml }]);
    const wb = readXlsx(bytes);
    expect(wb.sheets).toEqual([{ name: '', rows: [] }]);
  });

  it('decodes the standard named XML entities in shared strings', () => {
    const sharedStrings = enc(
      `<?xml version="1.0"?><sst><si><t>&amp;&lt;&gt;&quot;&apos;&#x41;</t></si></sst>`,
    );
    const sheet = enc(
      `<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>`,
    );
    const bytes = buildZip([
      { name: 'xl/workbook.xml', data: workbook },
      { name: 'xl/_rels/workbook.xml.rels', data: rels },
      { name: 'xl/sharedStrings.xml', data: sharedStrings },
      { name: 'xl/worksheets/sheet1.xml', data: sheet },
    ]);
    const wb = readXlsx(bytes);
    expect(wb.sheets[0]!.rows).toEqual([['&<>"\'A']]);
  });
});

describe('readXlsx error handling', () => {
  it('throws on input too small to be a zip', () => {
    expect(() => readXlsx(new Uint8Array(4))).toThrow(/not a zip/);
  });

  it('throws when no end-of-central-directory record is present', () => {
    // 22+ bytes of zeros: no EOCD signature anywhere.
    expect(() => readXlsx(new Uint8Array(64))).toThrow(/end-of-central-directory/);
  });

  it('throws when xl/workbook.xml is missing', () => {
    const bytes = buildZip([{ name: '[Content_Types].xml', data: CONTENT_TYPES }]);
    expect(() => readXlsx(bytes)).toThrow(/missing xl\/workbook\.xml/);
  });

  it('throws on a corrupt central directory header', () => {
    const bytes = buildZip([{ name: 'xl/workbook.xml', data: enc('<workbook/>') }]);
    // Corrupt the central-directory signature. Locate it from the EOCD offset.
    const view = new DataView(bytes.buffer);
    const cdOffset = view.getUint32(bytes.length - 22 + 16, true);
    bytes[cdOffset] = 0xff;
    expect(() => readXlsx(bytes)).toThrow(/corrupt central directory/);
  });

  it('throws on a corrupt local file header', () => {
    const bytes = buildZip([{ name: 'xl/workbook.xml', data: enc('<workbook/>') }]);
    bytes[0] = 0xff; // first entry's local header signature
    expect(() => readXlsx(bytes)).toThrow(/corrupt local file header/);
  });

  it('throws on an unsupported compression method', () => {
    // Hand-build a zip whose central + local headers declare method 99.
    const data = enc('<workbook/>');
    const name = enc('xl/workbook.xml');
    const crc = crc32(data);

    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, 99, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);

    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 99, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, 0, true);
    cd.set(name, 46);

    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, 1, true);
    ev.setUint16(10, 1, true);
    ev.setUint32(12, cd.length, true);
    ev.setUint32(16, local.length, true);

    const bytes = new Uint8Array(local.length + cd.length + end.length);
    bytes.set(local, 0);
    bytes.set(cd, local.length);
    bytes.set(end, local.length + cd.length);

    expect(() => readXlsx(bytes)).toThrow(/unsupported compression method 99/);
  });
});
