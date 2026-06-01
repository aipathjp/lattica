import { describe, it, expect } from 'vitest';
import { crc32, buildZip } from './zip.js';

const enc = (s: string) => new TextEncoder().encode(s);

describe('crc32', () => {
  it('matches the canonical check value', () => {
    // CRC-32 of "123456789" is 0xCBF43926.
    expect(crc32(enc('123456789'))).toBe(0xcbf43926);
  });
  it('is 0 for empty input', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
  it('differs for different content', () => {
    expect(crc32(enc('a'))).not.toBe(crc32(enc('b')));
  });
});

describe('buildZip', () => {
  it('starts with the local file header signature', () => {
    const zip = buildZip([{ name: 'a.txt', data: enc('hello') }]);
    expect(Array.from(zip.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it('ends with the end-of-central-directory record', () => {
    const zip = buildZip([{ name: 'a.txt', data: enc('hi') }]);
    const eocd = zip.slice(zip.length - 22);
    expect(Array.from(eocd.slice(0, 4))).toEqual([0x50, 0x4b, 0x05, 0x06]);
    const view = new DataView(eocd.buffer, eocd.byteOffset);
    expect(view.getUint16(8, true)).toBe(1); // entries on disk
    expect(view.getUint16(10, true)).toBe(1); // total entries
  });

  it('records the correct entry count for multiple files', () => {
    const zip = buildZip([
      { name: 'a', data: enc('1') },
      { name: 'b', data: enc('2') },
      { name: 'c', data: enc('3') },
    ]);
    const view = new DataView(zip.buffer, zip.byteOffset + zip.length - 22);
    expect(view.getUint16(10, true)).toBe(3);
  });

  it('embeds the file name and content', () => {
    const zip = buildZip([{ name: 'hello.txt', data: enc('world') }]);
    const text = new TextDecoder().decode(zip);
    expect(text).toContain('hello.txt');
    expect(text).toContain('world');
  });

  it('stores the uncompressed size in the local header', () => {
    const data = enc('abcdef');
    const zip = buildZip([{ name: 'x', data }]);
    const view = new DataView(zip.buffer, zip.byteOffset);
    expect(view.getUint32(22, true)).toBe(data.length); // uncompressed size
    expect(view.getUint32(18, true)).toBe(data.length); // compressed size (stored)
    expect(view.getUint16(8, true)).toBe(0); // method = stored
  });
});
