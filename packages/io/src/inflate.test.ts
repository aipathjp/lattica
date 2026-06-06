import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { inflateRaw } from './inflate.js';

/** Round-trip helper: deflate with node, inflate with our implementation. */
function roundTrip(buf: Buffer | Uint8Array, level?: number): void {
  const opts = level === undefined ? undefined : { level };
  const deflated = deflateRawSync(buf, opts);
  const inflated = inflateRaw(new Uint8Array(deflated));
  expect(Array.from(inflated)).toEqual(Array.from(new Uint8Array(buf)));
}

const enc = (s: string) => new TextEncoder().encode(s);

/** Decode a base64 fixture into bytes. */
const fromB64 = (s: string): Uint8Array =>
  new Uint8Array(Buffer.from(s, 'base64'));

describe('inflateRaw round-trips against node:zlib', () => {
  it('handles empty input', () => {
    roundTrip(Buffer.alloc(0));
  });

  it('handles a short string', () => {
    roundTrip(enc('hello'));
  });

  it('handles a single byte', () => {
    roundTrip(new Uint8Array([0x42]));
  });

  it('handles highly repetitive data (forces back-references)', () => {
    // Long run of repeats exercises LZ77 length/distance copies.
    roundTrip(enc('abcabcabc'.repeat(2000)));
  });

  it('handles a long run of a single byte', () => {
    roundTrip(new Uint8Array(50_000).fill(0x61));
  });

  it('handles natural-language text', () => {
    const text =
      'The quick brown fox jumps over the lazy dog. '.repeat(500) +
      'Pack my box with five dozen liquor jugs.';
    roundTrip(enc(text));
  });

  it('handles ~100KB of pseudo-random bytes', () => {
    // Deterministic LCG so the test is reproducible. Random-ish data tends to
    // produce stored or low-compression blocks and exercises large distances.
    const data = new Uint8Array(100_000);
    let seed = 0x12345678;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed >>> 16) & 0xff;
    }
    roundTrip(data);
  });

  it('handles mixed structured data forcing dynamic Huffman with extra dist bits', () => {
    // Build data with widely varying back-reference distances so the dynamic
    // distance codes use several extra-bit lengths.
    const parts: number[] = [];
    for (let block = 0; block < 200; block++) {
      for (let i = 0; i < 300; i++) parts.push((i * 7 + block) & 0xff);
      // Re-emit an earlier large chunk to create long-distance matches.
      const start = Math.max(0, parts.length - 5000);
      for (let i = start; i < start + 200 && i < parts.length; i++) {
        parts.push(parts[i]!);
      }
    }
    roundTrip(new Uint8Array(parts));
  });
});

describe('inflateRaw dynamic Huffman edge cases', () => {
  // Real node:zlib output that encodes code-length symbol 16 ("repeat the
  // previous code length 3-6 times"), captured as a fixture so the test does
  // not depend on the exact heuristics of the current zlib version. The
  // original text is a 4532-byte stream of repeated dictionary words.
  const CL16_DEFLATE =
    'bVhZdtswELuKrmYnpuTUDBXvyun7CGAWqv2IKnOZfTBQb+ty/n5P6+Hjz1TOzxPf8Ph6zLfp81Du0/P0Pn/Pl206XvrGsb2nr8fnfJp+T8fr4TbdlxMPvs73ZVraS9v9INb5aL+n7+lGhT+Pw/X+y42vR11v08/j/PFnupx/Hu06fbZZy3y2giXd6vpgLDfxKlPqNh2v7fWtp8RJKaR0I7jJ293IutHlZ3vZlb4sme15usKrumUL+h+NhheMDSJwOfxuuBCBa28I73egxE7ghUFuL1nXPWUQ5xsP0F6XZpGZEZhqecFR7tEi3HLrh5TlNCOG7W2Bu3C1H6Y9dBKecRmaYW9Xs8Z5PhUj99Fy3WYJxH3lhEqpojAVXCopL9AtyyG2bilWxcpMqVNSFEWPWt2Svbyd6peX/HArcJDBQAh7CiNKkVkGuUBI3dxKmgLD8Vitc7pdu9tc7gY9PU+41H9COcuEtXuxSnUpq2e/G8H7u56VWVlE6iB2dH+rlBFxcO1dY/dfnuWE4xBfIRSPLhN/UZs7lLFeR+p8P52XhTPMEqSk5u7S6bCXvNudMhs5gJ1VcrsveLFCZFDaOyCqVwQqzcAIAkJUcfdSq3G7eP3VMXEws6LAcBwPLHqKHOeyeVparOvMl1Yi3MqDmtOXE2a1kvO0K2Wdk0IPEk91s2Sh/hmaHTbppkp5RCsGcazMpsEjywwgiXssDjQhDLD2xYO58Q21H7ybWc5hNc/KTgtXeBcBio26eXEZYjnupfmAVFPRYp0qWejcYr8G6M0VQ+mprTw40QBRISmkszXtbJOzFYNodDSUCFa7lH+jjtM52QFDCm+An6yDUWnMyJXLfgLgCO3uaMcu6D0xeCHd1jCROoVewRNezyNy5t74D7gFU1G9eFaGnozhNxZ/K4kDcaYnQFdgCuTHBLe50wU7E6pbyillwHTHVN5aVPuJ/xwNoNSxmh0JifpPK0f318nRnnmBg+xir+15mPch29Od2FCA8poGy1i3iRJIUdZ3jHLXP70rxZBMXntRytBBAUeIL0PHLfbqHAhXt5EPsJfKCAfhDN4SnetjQtFkbOXBMP6CpdkqZxXljHCZ+NNxR1g0dKu1lQNsEOBUd5q5ZVybM6drJQaFlf5IOYaGjpqr6RfpVXTJWKhCrh614DdOlLLPClyqWwffQIY8RkjFYyp5ToIQx6TzgQFdxcAtG54RTGNG9klrQtJgrqnO+PuSOEv+MjBSJ8JqSIU+NL5HP4cxQNsUHPI+RhkmiI5yiuzmZoCWUReFck11ykPdCKEQ7U/BCQI9Mpo1JofhZWLwFsdgpT0zi9s/zqj0QVXT6MlfYU50Fx/1AxDCyMQuWkkSnec4eyX05UmxOMgCVaFhj1oJtPNgsfyNw8Hh3xhQoJASnSfGQIoSj69bfOuMTD65nz69HAhTlXBkplHfr0qhN4bBWZBxxAFvwwcScjrSzeybNUf+Qp933+1DbdPP3AcBEl6lGDsxPeNTJhA2ClVt34U74QooyHwhNXkI8h556ofDwFnD07/m7IRD9RqkzQahDX+NiiGWidIal5DLy8AMY77Ef2CMLbQ4K7Y58Bc=';

  it('decodes a stream that uses code-length repeat symbol 16', () => {
    const inflated = inflateRaw(fromB64(CL16_DEFLATE));
    expect(inflated.length).toBe(4532);
    expect(new TextDecoder().decode(inflated).slice(0, 11)).toBe('sphinx pack');
  });
});

describe('inflateRaw stored blocks', () => {
  it('inflates a level-0 (stored) stream', () => {
    roundTrip(enc('store me uncompressed please'), 0);
  });

  it('inflates a large level-0 stream spanning multiple stored blocks', () => {
    // Stored blocks cap at 65535 bytes, so >64KB forces multiple blocks and
    // multiple BFINAL=0 iterations of the main loop.
    const data = new Uint8Array(200_000);
    let seed = 0xdeadbeef;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      data[i] = (seed >>> 8) & 0xff;
    }
    roundTrip(data, 0);
  });

  it('inflates an empty level-0 stream', () => {
    roundTrip(Buffer.alloc(0), 0);
  });
});

describe('inflateRaw error handling', () => {
  it('throws RangeError on an invalid block type (BTYPE=11)', () => {
    // First byte: BFINAL=1 (bit0), BTYPE=11 (bits1-2) => 0b111 = 0x07.
    expect(() => inflateRaw(new Uint8Array([0x07]))).toThrow(RangeError);
    expect(() => inflateRaw(new Uint8Array([0x07]))).toThrow(
      'invalid block type',
    );
  });

  it('throws RangeError on truncated input', () => {
    const deflated = new Uint8Array(deflateRawSync(enc('hello world')));
    const truncated = deflated.subarray(0, deflated.length - 2);
    expect(() => inflateRaw(truncated)).toThrow(RangeError);
  });

  it('throws RangeError on empty input (cannot read block header)', () => {
    expect(() => inflateRaw(new Uint8Array(0))).toThrow(RangeError);
    expect(() => inflateRaw(new Uint8Array(0))).toThrow(
      'unexpected end of input',
    );
  });

  it('throws RangeError on a stored block with a bad length complement', () => {
    // BFINAL=1, BTYPE=00, align, then LEN=0x0001, NLEN=0x0000 (wrong complement).
    const bytes = new Uint8Array([0x01, 0x01, 0x00, 0x00, 0x00]);
    expect(() => inflateRaw(bytes)).toThrow('length check failed');
  });

  it('throws RangeError on a truncated stored block payload', () => {
    // BFINAL=1, BTYPE=00, LEN=0x0005, NLEN=0xFFFA, but no payload bytes follow.
    const bytes = new Uint8Array([0x01, 0x05, 0x00, 0xfa, 0xff]);
    expect(() => inflateRaw(bytes)).toThrow('unexpected end of input');
  });

  // The following fixtures are hand-built bitstreams that exercise the
  // defensive guards which valid (node-produced) streams never trip.

  it('throws RangeError on an invalid length symbol in a fixed block', () => {
    // Fixed Huffman block emitting literal/length symbol 286, which is reserved
    // and has no defined length base.
    expect(() => inflateRaw(fromB64('GwM='))).toThrow('invalid length symbol');
  });

  it('throws RangeError when a back-reference distance exceeds the output', () => {
    // Fixed block: one literal then a length/distance copy reaching before the
    // start of the output window.
    expect(() => inflateRaw(fromB64('cwRSAA=='))).toThrow(
      'distance exceeds output',
    );
  });

  it('throws RangeError on an undecodable Huffman code (incomplete tree)', () => {
    // Dynamic block whose literal/length tree has a single 2-bit symbol, then a
    // bit pattern that matches no code.
    expect(() =>
      inflateRaw(
        fromB64(
          'BeABBAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA0',
        ),
      ),
    ).toThrow('invalid Huffman code');
  });

  it('throws RangeError on an invalid distance symbol (> 29)', () => {
    // Dynamic block whose distance tree maps a code to symbol 30.
    expect(() =>
      inflateRaw(
        fromB64(
          'Ff4BCAAAAIIgAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFQAAAAAAAAAYAA=',
        ),
      ),
    ).toThrow('invalid distance symbol');
  });

  it('throws RangeError when code lengths overrun HLIT + HDIST', () => {
    // Dynamic block whose code-length repeats produce more entries than
    // HLIT + HDIST declares.
    expect(() => inflateRaw(fromB64('BQCA5P8fAAA='))).toThrow(
      'code length overrun',
    );
  });

  it('throws RangeError on a dynamic block whose first repeat code has no previous length', () => {
    // Construct a dynamic block where the very first code-length symbol is 16
    // (copy previous), which is illegal because there is no previous length.
    const bits: number[] = [];
    const pushBits = (value: number, count: number): void => {
      for (let i = 0; i < count; i++) bits.push((value >> i) & 1);
    };
    pushBits(1, 1); // BFINAL=1
    pushBits(2, 2); // BTYPE=10 dynamic
    pushBits(0, 5); // HLIT  = 257
    pushBits(0, 5); // HDIST = 1
    pushBits(0, 4); // HCLEN = 4 -> 4 code-length codes

    // Code-length code lengths in CODE_LENGTH_ORDER: [16, 17, 18, 0].
    // Give symbol 16 length 1 and symbol 17 length 1 so 16 is the shortest
    // canonical code (bit 0). Others length 0.
    pushBits(1, 3); // length for symbol 16
    pushBits(1, 3); // length for symbol 17
    pushBits(0, 3); // length for symbol 18
    pushBits(0, 3); // length for symbol 0

    // Now decode code-length symbols. Canonical: symbol 16 -> code "0",
    // symbol 17 -> code "1". Emit a single bit 0 to select symbol 16 first.
    pushBits(0, 1); // selects symbol 16 (illegal as first symbol)

    const bytes = packBits(bits);
    expect(() => inflateRaw(bytes)).toThrow('repeat with no previous length');
  });
});

/** Pack an LSB-first bit array into bytes. */
function packBits(bits: readonly number[]): Uint8Array {
  const out = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) out[i >> 3]! |= 1 << (i & 7);
  }
  return out;
}
