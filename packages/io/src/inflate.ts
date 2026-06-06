/**
 * Dependency-free raw DEFLATE decompressor (RFC 1951).
 *
 * Decodes the bare DEFLATE bitstream (no zlib/gzip wrapper). This complements
 * the STORED-only ZIP writer in `zip.ts` by allowing the reader side to inflate
 * compressed entries produced by other tools, without pulling in `node:zlib`
 * (which keeps the package free of any platform/runtime dependency).
 *
 * Supports all three block types: stored (BTYPE=00), fixed Huffman (BTYPE=01)
 * and dynamic Huffman (BTYPE=10), including LZ77 length/distance back-references.
 * Malformed input throws a `RangeError`.
 */

/** Bit reader over a byte array, LSB-first within each byte (DEFLATE order). */
class BitReader {
  private bitBuf = 0;
  private bitCount = 0;
  private pos = 0;

  constructor(private readonly bytes: Uint8Array) {}

  /** Read `count` bits (0..32) as an unsigned integer, LSB first. */
  readBits(count: number): number {
    while (this.bitCount < count) {
      if (this.pos >= this.bytes.length) {
        throw new RangeError('inflate: unexpected end of input');
      }
      this.bitBuf |= this.bytes[this.pos]! << this.bitCount;
      this.pos += 1;
      this.bitCount += 8;
    }
    const value = this.bitBuf & ((1 << count) - 1);
    this.bitBuf >>>= count;
    this.bitCount -= count;
    return value;
  }

  /** Discard bits until the reader is aligned to a byte boundary. */
  alignToByte(): void {
    const drop = this.bitCount & 7;
    this.bitBuf >>>= drop;
    this.bitCount -= drop;
  }

  /**
   * Read `count` aligned bytes directly (used for stored blocks). The caller
   * must invoke {@link alignToByte} first; stored blocks are always
   * byte-aligned by spec, so the reader is at a byte boundary here.
   */
  readBytes(count: number): Uint8Array {
    if (this.pos + count > this.bytes.length) {
      throw new RangeError('inflate: unexpected end of input');
    }
    const out = this.bytes.subarray(this.pos, this.pos + count);
    this.pos += count;
    return out;
  }
}

/**
 * Canonical Huffman decoder built from a list of code lengths. Decoding walks
 * the bitstream one bit at a time using the standard first-code/count tables.
 */
class HuffmanTree {
  private readonly counts: Uint16Array;
  private readonly symbols: Uint16Array;
  private readonly maxBits: number;

  constructor(lengths: readonly number[]) {
    let maxBits = 0;
    for (const len of lengths) {
      if (len > maxBits) maxBits = len;
    }
    this.maxBits = maxBits;
    this.counts = new Uint16Array(maxBits + 1);
    for (const len of lengths) {
      if (len > 0) this.counts[len]! += 1;
    }
    // Compute the starting symbol offset for each length.
    const offsets = new Uint16Array(maxBits + 2);
    for (let bits = 1; bits <= maxBits; bits++) {
      offsets[bits + 1] = offsets[bits]! + this.counts[bits]!;
    }
    this.symbols = new Uint16Array(lengths.length);
    for (let symbol = 0; symbol < lengths.length; symbol++) {
      const len = lengths[symbol]!;
      if (len > 0) {
        this.symbols[offsets[len]!] = symbol;
        offsets[len]! += 1;
      }
    }
  }

  /** Decode a single symbol from the bit reader. */
  decode(reader: BitReader): number {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len <= this.maxBits; len++) {
      code |= reader.readBits(1);
      const count = this.counts[len]!;
      if (code - first < count) {
        return this.symbols[index + (code - first)]!;
      }
      index += count;
      first = (first + count) << 1;
      code <<= 1;
    }
    throw new RangeError('inflate: invalid Huffman code');
  }
}

// Length codes 257..285: base lengths and extra-bit counts (RFC 1951 §3.2.5).
const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67,
  83, 99, 115, 131, 163, 195, 227, 258,
];
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5,
  5, 5, 0,
];

// Distance codes 0..29: base distances and extra-bit counts.
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769,
  1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11,
  11, 12, 12, 13, 13,
];

// Order in which code-length code lengths are stored in dynamic blocks.
const CODE_LENGTH_ORDER = [
  16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
];

/** Build the fixed (static) literal/length tree defined by RFC 1951 §3.2.6. */
function buildFixedLiteralTree(): HuffmanTree {
  const lengths = new Array<number>(288);
  for (let i = 0; i < 144; i++) lengths[i] = 8;
  for (let i = 144; i < 256; i++) lengths[i] = 9;
  for (let i = 256; i < 280; i++) lengths[i] = 7;
  for (let i = 280; i < 288; i++) lengths[i] = 8;
  return new HuffmanTree(lengths);
}

/** Build the fixed (static) distance tree: 30 codes of 5 bits each. */
function buildFixedDistanceTree(): HuffmanTree {
  return new HuffmanTree(new Array<number>(30).fill(5));
}

/** Read the dynamic Huffman code-length arrays for a BTYPE=10 block. */
function readDynamicLengths(reader: BitReader): {
  literalTree: HuffmanTree;
  distanceTree: HuffmanTree;
} {
  const hlit = reader.readBits(5) + 257;
  const hdist = reader.readBits(5) + 1;
  const hclen = reader.readBits(4) + 4;

  const clLengths = new Array<number>(19).fill(0);
  for (let i = 0; i < hclen; i++) {
    clLengths[CODE_LENGTH_ORDER[i]!] = reader.readBits(3);
  }
  const clTree = new HuffmanTree(clLengths);

  const allLengths: number[] = [];
  while (allLengths.length < hlit + hdist) {
    const symbol = clTree.decode(reader);
    if (symbol < 16) {
      allLengths.push(symbol);
    } else if (symbol === 16) {
      const prev = allLengths[allLengths.length - 1];
      if (prev === undefined) {
        throw new RangeError('inflate: repeat with no previous length');
      }
      const repeat = reader.readBits(2) + 3;
      for (let i = 0; i < repeat; i++) allLengths.push(prev);
    } else if (symbol === 17) {
      const repeat = reader.readBits(3) + 3;
      for (let i = 0; i < repeat; i++) allLengths.push(0);
    } else {
      // symbol === 18
      const repeat = reader.readBits(7) + 11;
      for (let i = 0; i < repeat; i++) allLengths.push(0);
    }
  }
  if (allLengths.length > hlit + hdist) {
    throw new RangeError('inflate: code length overrun');
  }

  const literalTree = new HuffmanTree(allLengths.slice(0, hlit));
  const distanceTree = new HuffmanTree(allLengths.slice(hlit));
  return { literalTree, distanceTree };
}

/** Decode one compressed block (fixed or dynamic) into `out`. */
function inflateBlock(
  reader: BitReader,
  literalTree: HuffmanTree,
  distanceTree: HuffmanTree,
  out: number[],
): void {
  for (;;) {
    const symbol = literalTree.decode(reader);
    if (symbol === 256) {
      return; // end of block
    }
    if (symbol < 256) {
      out.push(symbol);
      continue;
    }
    // Length/distance back-reference.
    const lengthIndex = symbol - 257;
    if (lengthIndex >= LENGTH_BASE.length) {
      throw new RangeError('inflate: invalid length symbol');
    }
    const length =
      LENGTH_BASE[lengthIndex]! + reader.readBits(LENGTH_EXTRA[lengthIndex]!);

    const distSymbol = distanceTree.decode(reader);
    if (distSymbol >= DIST_BASE.length) {
      throw new RangeError('inflate: invalid distance symbol');
    }
    const distance =
      DIST_BASE[distSymbol]! + reader.readBits(DIST_EXTRA[distSymbol]!);
    if (distance > out.length) {
      throw new RangeError('inflate: distance exceeds output');
    }
    const start = out.length - distance;
    for (let i = 0; i < length; i++) {
      out.push(out[start + i]!);
    }
  }
}

/**
 * Inflate a raw DEFLATE byte stream (RFC 1951, no zlib/gzip header).
 *
 * @param input - The compressed bytes.
 * @returns The decompressed bytes.
 * @throws RangeError if the input is malformed or truncated.
 */
export function inflateRaw(input: Uint8Array): Uint8Array {
  const reader = new BitReader(input);
  const out: number[] = [];
  let final = 0;

  do {
    final = reader.readBits(1);
    const type = reader.readBits(2);

    if (type === 0) {
      // Stored (uncompressed) block.
      reader.alignToByte();
      const len = reader.readBits(16);
      const nlen = reader.readBits(16);
      if ((len ^ 0xffff) !== nlen) {
        throw new RangeError('inflate: stored block length check failed');
      }
      const block = reader.readBytes(len);
      for (let i = 0; i < block.length; i++) out.push(block[i]!);
    } else if (type === 1) {
      // Fixed Huffman block.
      inflateBlock(
        reader,
        buildFixedLiteralTree(),
        buildFixedDistanceTree(),
        out,
      );
    } else if (type === 2) {
      // Dynamic Huffman block.
      const { literalTree, distanceTree } = readDynamicLengths(reader);
      inflateBlock(reader, literalTree, distanceTree, out);
    } else {
      throw new RangeError('inflate: invalid block type');
    }
  } while (final === 0);

  return Uint8Array.from(out);
}
