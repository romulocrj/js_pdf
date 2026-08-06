/*
 * Ported to JavaScript from https://github.com/DavBfr/dart_pdf
 *
 * Original work:
 * Copyright (C) 2017, David PHAM-VAN <dev.nfet.net@gmail.com>
 *
 * JavaScript port: https://github.com/romulocrj/js_pdf
 * Copyright (C) 2026, Romulo Campos
 *
 * This file has been substantially modified from the original Dart source.
 *
 * Licensed under the Apache License, Version 2.0.
 *
 * Original Dart sources ported into this file:
 *   - pdf/lib/src/pdf/format/object_base.dart
 *   - pdf/lib/src/pdf/format/dict_stream.dart
 *
 * DIVERGENCE: upstream declares a `DeflateCallback` on `PdfSettings` and leaves
 * the compressor to the caller — the advice in the Dart doc comment is to pass
 * the zlib encoder that ships with Dart's I/O library. The port cannot do that:
 * its target runtime is bare V8, where no such encoder exists and no callback
 * could be filled in. So the compressor lives here, in the library, written
 * against nothing but typed arrays.
 *
 * This is the encoder half of the DEFLATE already present in `image/png.ts`,
 * which decodes the zlib payload of a PNG. The two are independent — the shared
 * ground is the format, not the code — and each is small enough that keeping
 * them apart reads better than a common module of bit-level helpers.
 *
 * Output is RFC 1950 (zlib) framing around RFC 1951 (DEFLATE) blocks: LZ77
 * matching over a 32 KiB window, then one dynamic Huffman block per batch of
 * tokens, falling back to a stored block whenever the entropy coding would not
 * pay for itself.
 */

const MIN_MATCH = 3;
const MAX_MATCH = 258;
const WINDOW_SIZE = 32768;
const WINDOW_MASK = WINDOW_SIZE - 1;

const HASH_BITS = 15;
const HASH_SIZE = 1 << HASH_BITS;
const HASH_MASK = HASH_SIZE - 1;

/**
 * How far back along a hash chain to look for a longer match. The whole chain
 * can be thousands of positions deep on repetitive input, and the tail of it
 * almost never improves on what the head already found; zlib bounds it the same
 * way, per level.
 */
const MAX_CHAIN = 128;

/** Tokens per block. Larger blocks amortise the header, smaller ones adapt. */
const BLOCK_TOKENS = 1 << 14;

/** The largest `LEN` a stored block can declare. */
const MAX_STORED = 65535;

const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59,
  67, 83, 99, 115, 131, 163, 195, 227, 258
];

const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3,
  4, 4, 4, 4, 5, 5, 5, 5, 0
];

const DISTANCE_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513,
  769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577
];

const DISTANCE_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8,
  9, 9, 10, 10, 11, 11, 12, 12, 13, 13
];

/** The order RFC 1951 §3.2.7 writes the code-length code lengths in. */
const CODE_LENGTH_ORDER = [
  16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15
];

const LITERAL_SYMBOLS = 286;
const DISTANCE_SYMBOLS = 30;
const CODE_LENGTH_SYMBOLS = 19;
const END_OF_BLOCK = 256;

const MAX_CODE_BITS = 15;
const MAX_CODE_LENGTH_BITS = 7;

/** Length 3..258 to its code index, built once from `LENGTH_BASE`. */
const LENGTH_CODE = buildLengthCodes();

/** Distance 1..32768 to its code index, split the way zlib splits it. */
const DISTANCE_CODE_LOW = new Uint8Array(256);
const DISTANCE_CODE_HIGH = new Uint8Array(256);
buildDistanceCodes();

function buildLengthCodes(): Uint8Array {
  const table = new Uint8Array(MAX_MATCH + 1);
  let code = 0;
  for (let length = MIN_MATCH; length <= MAX_MATCH; length++) {
    while (code < LENGTH_BASE.length - 1 && length >= LENGTH_BASE[code + 1]!) {
      code++;
    }
    table[length] = code;
  }
  return table;
}

function buildDistanceCodes(): void {
  for (let distance = 1; distance <= 256; distance++) {
    DISTANCE_CODE_LOW[distance - 1] = distanceCodeFor(distance);
  }
  // Above 256 the codes are constant across each 128-distance span, so one
  // entry per span covers the rest of the window.
  for (let slot = 0; slot < 256; slot++) {
    DISTANCE_CODE_HIGH[slot] = distanceCodeFor((slot << 7) + 1);
  }
}

function distanceCodeFor(distance: number): number {
  let code = 0;
  while (code < DISTANCE_BASE.length - 1 && distance >= DISTANCE_BASE[code + 1]!) {
    code++;
  }
  return code;
}

function distanceCode(distance: number): number {
  return distance <= 256
    ? DISTANCE_CODE_LOW[distance - 1]!
    : DISTANCE_CODE_HIGH[(distance - 1) >>> 7]!;
}

/**
 * A growable bit sink, least-significant bit first.
 *
 * DEFLATE packs Huffman codes starting from the most significant bit but every
 * other field least significant first, so codes are pre-reversed when the table
 * is built and everything can be written through one path.
 */
class BitWriter {
  private bytes: Uint8Array;
  private length = 0;
  private bitBuffer = 0;
  private bitCount = 0;

  constructor(capacity: number) {
    this.bytes = new Uint8Array(Math.max(capacity, 64));
  }

  get byteLength(): number {
    return this.length;
  }

  private ensure(extra: number): void {
    if (this.length + extra <= this.bytes.length) return;
    let size = this.bytes.length * 2;
    while (size < this.length + extra) size *= 2;
    const grown = new Uint8Array(size);
    grown.set(this.bytes.subarray(0, this.length));
    this.bytes = grown;
  }

  writeBits(value: number, count: number): void {
    if (count === 0) return;
    this.bitBuffer |= (value << this.bitCount);
    this.bitCount += count;
    this.ensure(4);
    while (this.bitCount >= 8) {
      this.bytes[this.length++] = this.bitBuffer & 0xff;
      this.bitBuffer >>>= 8;
      this.bitCount -= 8;
    }
  }

  alignToByte(): void {
    if (this.bitCount > 0) {
      this.ensure(1);
      this.bytes[this.length++] = this.bitBuffer & 0xff;
      this.bitBuffer = 0;
      this.bitCount = 0;
    }
  }

  writeBytes(source: Uint8Array, start: number, end: number): void {
    this.ensure(end - start);
    this.bytes.set(source.subarray(start, end), this.length);
    this.length += end - start;
  }

  finish(): Uint8Array {
    this.alignToByte();
    return this.bytes.slice(0, this.length);
  }
}

/**
 * Code lengths for a canonical Huffman code over `frequencies`, none longer
 * than `limit` bits.
 *
 * The tree itself comes from the two-queue construction: with the leaves sorted
 * by weight, the next-smallest node is always at the head of the leaf queue or
 * the head of the internal-node queue, so no priority queue is needed. Skewed
 * input can still push a code past the limit, and the fix is to halve every
 * frequency and rebuild — each round flattens the distribution, and a flat one
 * over this many symbols is nowhere near 15 bits deep, so it terminates.
 */
function huffmanLengths(frequencies: Uint32Array, limit: number): Uint8Array {
  const symbolCount = frequencies.length;
  const lengths = new Uint8Array(symbolCount);

  const used: number[] = [];
  for (let symbol = 0; symbol < symbolCount; symbol++) {
    if (frequencies[symbol]! > 0) used.push(symbol);
  }

  if (used.length === 0) return lengths;
  if (used.length === 1) {
    // A one-symbol alphabet still needs a code to spend a bit on.
    lengths[used[0]!] = 1;
    return lengths;
  }

  const weights = new Float64Array(used.length);
  for (let index = 0; index < used.length; index++) {
    weights[index] = frequencies[used[index]!]!;
  }

  const order = used.map((_, index) => index);
  order.sort((a, b) => weights[a]! - weights[b]!);

  const leafCount = used.length;
  const nodeCount = 2 * leafCount - 1;
  const nodeWeight = new Float64Array(nodeCount);
  const leftChild = new Int32Array(nodeCount).fill(-1);
  const rightChild = new Int32Array(nodeCount).fill(-1);
  const depth = new Int32Array(nodeCount);

  for (;;) {
    for (let index = 0; index < leafCount; index++) {
      nodeWeight[index] = weights[order[index]!]!;
    }

    let leafHead = 0;
    let internalHead = leafCount;
    let internalTail = leafCount;
    let next = leafCount;

    const takeSmallest = (): number => {
      if (
        leafHead < leafCount &&
        (internalHead >= internalTail || nodeWeight[leafHead]! <= nodeWeight[internalHead]!)
      ) {
        return leafHead++;
      }
      return internalHead++;
    };

    while ((leafCount - leafHead) + (internalTail - internalHead) > 1) {
      const a = takeSmallest();
      const b = takeSmallest();
      nodeWeight[next] = nodeWeight[a]! + nodeWeight[b]!;
      leftChild[next] = a;
      rightChild[next] = b;
      internalTail = ++next;
    }

    // Depths fall out of one pass over the nodes: every internal node was
    // created after its children, so walking backwards visits parents first.
    const root = next - 1;
    depth[root] = 0;
    let deepest = 0;
    for (let node = root; node >= leafCount; node--) {
      const own = depth[node]!;
      const left = leftChild[node]!;
      const right = rightChild[node]!;
      depth[left] = own + 1;
      depth[right] = own + 1;
      if (left < leafCount && own + 1 > deepest) deepest = own + 1;
      if (right < leafCount && own + 1 > deepest) deepest = own + 1;
    }

    if (deepest <= limit) {
      for (let index = 0; index < leafCount; index++) {
        lengths[used[order[index]!]!] = depth[index]!;
      }
      return lengths;
    }

    for (let index = 0; index < leafCount; index++) {
      weights[index] = Math.floor((weights[index]! + 1) / 2);
    }
    order.sort((a, b) => weights[a]! - weights[b]!);
  }
}

function reverseBits(value: number, count: number): number {
  let reversed = 0;
  for (let bit = 0; bit < count; bit++) {
    reversed = (reversed << 1) | ((value >>> bit) & 1);
  }
  return reversed;
}

/**
 * Canonical codes for `lengths`, already bit-reversed so `BitWriter` can emit
 * them directly. RFC 1951 §3.2.2.
 */
function canonicalCodes(lengths: Uint8Array, maxBits: number): Uint16Array {
  const codes = new Uint16Array(lengths.length);
  const blockCount = new Uint32Array(maxBits + 1);

  for (const length of lengths) {
    if (length > 0) blockCount[length]!++;
  }

  const nextCode = new Uint32Array(maxBits + 2);
  let code = 0;
  for (let bits = 1; bits <= maxBits; bits++) {
    code = (code + blockCount[bits - 1]!) << 1;
    nextCode[bits] = code;
  }

  for (let symbol = 0; symbol < lengths.length; symbol++) {
    const length = lengths[symbol]!;
    if (length > 0) {
      codes[symbol] = reverseBits(nextCode[length]!++, length);
    }
  }

  return codes;
}

/** The `/16/17/18` run-length encoding of a code-length sequence. */
interface CodeLengthRuns {
  readonly symbols: number[];
  readonly extras: number[];
  readonly extraBits: number[];
}

function encodeCodeLengths(lengths: Uint8Array, count: number): CodeLengthRuns {
  const symbols: number[] = [];
  const extras: number[] = [];
  const extraBits: number[] = [];

  const emit = (symbol: number, extra: number, bits: number): void => {
    symbols.push(symbol);
    extras.push(extra);
    extraBits.push(bits);
  };

  let index = 0;
  while (index < count) {
    const length = lengths[index]!;
    let run = 1;
    while (index + run < count && lengths[index + run]! === length) run++;
    index += run;

    if (length === 0) {
      while (run >= 11) {
        const take = Math.min(run, 138);
        emit(18, take - 11, 7);
        run -= take;
      }
      while (run >= 3) {
        const take = Math.min(run, 10);
        emit(17, take - 3, 3);
        run -= take;
      }
    } else {
      // Symbol 16 repeats the *previous* length, so the first one is literal.
      emit(length, 0, 0);
      run--;
      while (run >= 3) {
        const take = Math.min(run, 6);
        emit(16, take - 3, 2);
        run -= take;
      }
    }

    while (run > 0) {
      emit(length, 0, 0);
      run--;
    }
  }

  return { symbols, extras, extraBits };
}

/** One batch of LZ77 output, ready to be entropy-coded. */
class TokenBuffer {
  /** Literal byte, or match length when the paired distance is non-zero. */
  readonly values = new Uint16Array(BLOCK_TOKENS);
  /** Match distance, or 0 to mark the value as a literal. */
  readonly distances = new Uint16Array(BLOCK_TOKENS);
  count = 0;

  readonly literalFrequencies = new Uint32Array(LITERAL_SYMBOLS);
  readonly distanceFrequencies = new Uint32Array(DISTANCE_SYMBOLS);

  reset(): void {
    this.count = 0;
    this.literalFrequencies.fill(0);
    this.distanceFrequencies.fill(0);
    this.literalFrequencies[END_OF_BLOCK] = 1;
  }

  addLiteral(byte: number): void {
    this.values[this.count] = byte;
    this.distances[this.count] = 0;
    this.count++;
    this.literalFrequencies[byte]!++;
  }

  addMatch(length: number, distance: number): void {
    this.values[this.count] = length;
    this.distances[this.count] = distance;
    this.count++;
    this.literalFrequencies[257 + LENGTH_CODE[length]!]!++;
    this.distanceFrequencies[distanceCode(distance)]!++;
  }
}

/** Bits a dynamic block would cost, header included, for the stored comparison. */
function dynamicBlockCost(
  tokens: TokenBuffer,
  literalLengths: Uint8Array,
  distanceLengths: Uint8Array,
  runs: CodeLengthRuns,
  codeLengthLengths: Uint8Array,
  headerCodeCount: number
): number {
  let bits = 3 + 5 + 5 + 4 + headerCodeCount * 3;

  for (let index = 0; index < runs.symbols.length; index++) {
    bits += codeLengthLengths[runs.symbols[index]!]! + runs.extraBits[index]!;
  }

  for (let symbol = 0; symbol < LITERAL_SYMBOLS; symbol++) {
    const frequency = tokens.literalFrequencies[symbol]!;
    if (frequency === 0) continue;
    bits += frequency * literalLengths[symbol]!;
    if (symbol >= 257) bits += frequency * LENGTH_EXTRA[symbol - 257]!;
  }

  for (let symbol = 0; symbol < DISTANCE_SYMBOLS; symbol++) {
    const frequency = tokens.distanceFrequencies[symbol]!;
    if (frequency === 0) continue;
    bits += frequency * (distanceLengths[symbol]! + DISTANCE_EXTRA[symbol]!);
  }

  return bits;
}

function writeStoredBlocks(
  writer: BitWriter,
  data: Uint8Array,
  start: number,
  end: number,
  isFinal: boolean
): void {
  let cursor = start;
  do {
    const chunkEnd = Math.min(cursor + MAX_STORED, end);
    const last = isFinal && chunkEnd === end;
    writer.writeBits(last ? 1 : 0, 1);
    writer.writeBits(0, 2);
    writer.alignToByte();
    const length = chunkEnd - cursor;
    writer.writeBits(length & 0xff, 8);
    writer.writeBits((length >>> 8) & 0xff, 8);
    writer.writeBits(~length & 0xff, 8);
    writer.writeBits((~length >>> 8) & 0xff, 8);
    writer.writeBytes(data, cursor, chunkEnd);
    cursor = chunkEnd;
  } while (cursor < end);
}

function writeBlock(
  writer: BitWriter,
  tokens: TokenBuffer,
  data: Uint8Array,
  start: number,
  end: number,
  isFinal: boolean
): void {
  // A distance tree with no codes at all is not representable, so an
  // all-literal block still declares one.
  if (tokens.distanceFrequencies.every(frequency => frequency === 0)) {
    tokens.distanceFrequencies[0] = 1;
  }

  const literalLengths = huffmanLengths(tokens.literalFrequencies, MAX_CODE_BITS);
  const distanceLengths = huffmanLengths(tokens.distanceFrequencies, MAX_CODE_BITS);

  let literalCount = LITERAL_SYMBOLS;
  while (literalCount > 257 && literalLengths[literalCount - 1]! === 0) literalCount--;
  let distanceCount = DISTANCE_SYMBOLS;
  while (distanceCount > 1 && distanceLengths[distanceCount - 1]! === 0) distanceCount--;

  const combined = new Uint8Array(literalCount + distanceCount);
  combined.set(literalLengths.subarray(0, literalCount), 0);
  combined.set(distanceLengths.subarray(0, distanceCount), literalCount);

  const runs = encodeCodeLengths(combined, combined.length);

  const codeLengthFrequencies = new Uint32Array(CODE_LENGTH_SYMBOLS);
  for (const symbol of runs.symbols) codeLengthFrequencies[symbol]!++;
  const codeLengthLengths = huffmanLengths(codeLengthFrequencies, MAX_CODE_LENGTH_BITS);

  let headerCodeCount = CODE_LENGTH_SYMBOLS;
  while (
    headerCodeCount > 4 &&
    codeLengthLengths[CODE_LENGTH_ORDER[headerCodeCount - 1]!]! === 0
  ) {
    headerCodeCount--;
  }

  const dynamicBits = dynamicBlockCost(
    tokens, literalLengths, distanceLengths, runs, codeLengthLengths, headerCodeCount
  );

  // A stored block costs its bytes plus a byte-aligned five-byte header, and
  // the alignment can waste up to seven bits of the current byte.
  const storedBits = 8 * (end - start) + 40 + 7;
  if (storedBits < dynamicBits) {
    writeStoredBlocks(writer, data, start, end, isFinal);
    return;
  }

  const literalCodes = canonicalCodes(literalLengths, MAX_CODE_BITS);
  const distanceCodes = canonicalCodes(distanceLengths, MAX_CODE_BITS);
  const codeLengthCodes = canonicalCodes(codeLengthLengths, MAX_CODE_LENGTH_BITS);

  writer.writeBits(isFinal ? 1 : 0, 1);
  writer.writeBits(2, 2);
  writer.writeBits(literalCount - 257, 5);
  writer.writeBits(distanceCount - 1, 5);
  writer.writeBits(headerCodeCount - 4, 4);

  for (let index = 0; index < headerCodeCount; index++) {
    writer.writeBits(codeLengthLengths[CODE_LENGTH_ORDER[index]!]!, 3);
  }

  for (let index = 0; index < runs.symbols.length; index++) {
    const symbol = runs.symbols[index]!;
    writer.writeBits(codeLengthCodes[symbol]!, codeLengthLengths[symbol]!);
    writer.writeBits(runs.extras[index]!, runs.extraBits[index]!);
  }

  for (let index = 0; index < tokens.count; index++) {
    const value = tokens.values[index]!;
    const distance = tokens.distances[index]!;

    if (distance === 0) {
      writer.writeBits(literalCodes[value]!, literalLengths[value]!);
      continue;
    }

    const lengthIndex = LENGTH_CODE[value]!;
    const lengthSymbol = 257 + lengthIndex;
    writer.writeBits(literalCodes[lengthSymbol]!, literalLengths[lengthSymbol]!);
    writer.writeBits(value - LENGTH_BASE[lengthIndex]!, LENGTH_EXTRA[lengthIndex]!);

    const distanceIndex = distanceCode(distance);
    writer.writeBits(distanceCodes[distanceIndex]!, distanceLengths[distanceIndex]!);
    writer.writeBits(distance - DISTANCE_BASE[distanceIndex]!, DISTANCE_EXTRA[distanceIndex]!);
  }

  writer.writeBits(literalCodes[END_OF_BLOCK]!, literalLengths[END_OF_BLOCK]!);
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  // 5552 is the most iterations that cannot overflow the accumulator, so the
  // modulo runs once per span instead of once per byte.
  let index = 0;
  while (index < bytes.length) {
    const end = Math.min(index + 5552, bytes.length);
    while (index < end) {
      a += bytes[index++]!;
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** Compress `data` to a raw RFC 1951 DEFLATE stream. */
export function deflateRaw(data: Uint8Array): Uint8Array {
  const writer = new BitWriter(Math.max(64, data.length >>> 1));

  if (data.length === 0) {
    writeStoredBlocks(writer, data, 0, 0, true);
    return writer.finish();
  }

  const head = new Int32Array(HASH_SIZE).fill(-1);
  const previous = new Int32Array(WINDOW_SIZE).fill(-1);
  const tokens = new TokenBuffer();
  tokens.reset();

  let blockStart = 0;
  let position = 0;
  let hash = 0;

  const insert = (at: number): number => {
    const slot = hash;
    previous[at & WINDOW_MASK] = head[slot]!;
    head[slot] = at;
    return slot;
  };

  const rollHash = (at: number): void => {
    hash = ((hash << 5) ^ data[at]!) & HASH_MASK;
  };

  // Prime the rolling hash with the first two bytes; `insert` is only ever
  // called once a third byte is in it.
  if (data.length >= MIN_MATCH) {
    rollHash(0);
    rollHash(1);
  }

  while (position < data.length) {
    let matchLength = 0;
    let matchDistance = 0;

    if (position + MIN_MATCH <= data.length) {
      rollHash(position + MIN_MATCH - 1);

      let candidate = head[hash]!;
      let chain = MAX_CHAIN;
      const limit = position - WINDOW_SIZE;

      while (candidate > limit && candidate >= 0 && chain-- > 0) {
        // The byte past the best match so far is the cheapest disqualifier.
        if (
          data[candidate + matchLength] === data[position + matchLength] &&
          data[candidate] === data[position]
        ) {
          let length = 0;
          const maximum = Math.min(MAX_MATCH, data.length - position);
          while (length < maximum && data[candidate + length] === data[position + length]) {
            length++;
          }
          if (length > matchLength) {
            matchLength = length;
            matchDistance = position - candidate;
            if (length >= maximum) break;
          }
        }
        candidate = previous[candidate & WINDOW_MASK]!;
      }
    }

    if (matchLength >= MIN_MATCH) {
      tokens.addMatch(matchLength, matchDistance);
      // Every position the match covers still has to enter the hash chains, or
      // later matches would not find them.
      const end = position + matchLength;
      insert(position);
      for (let at = position + 1; at < end; at++) {
        if (at + MIN_MATCH <= data.length) {
          rollHash(at + MIN_MATCH - 1);
          insert(at);
        }
      }
      position = end;
    } else {
      tokens.addLiteral(data[position]!);
      if (position + MIN_MATCH <= data.length) insert(position);
      position++;
    }

    if (tokens.count >= BLOCK_TOKENS - 1) {
      writeBlock(writer, tokens, data, blockStart, position, false);
      tokens.reset();
      blockStart = position;
    }
  }

  writeBlock(writer, tokens, data, blockStart, position, true);
  return writer.finish();
}

/**
 * Compress `data` to an RFC 1950 zlib stream — the framing `/FlateDecode`
 * expects.
 */
export function deflateZlib(data: Uint8Array): Uint8Array {
  const body = deflateRaw(data);
  const output = new Uint8Array(body.length + 6);

  // 0x78 0x9c: deflate with a 32 KiB window, default level. The pair is a
  // multiple of 31, which is the header's own check.
  output[0] = 0x78;
  output[1] = 0x9c;
  output.set(body, 2);

  const checksum = adler32(data);
  output[body.length + 2] = (checksum >>> 24) & 0xff;
  output[body.length + 3] = (checksum >>> 16) & 0xff;
  output[body.length + 4] = (checksum >>> 8) & 0xff;
  output[body.length + 5] = checksum & 0xff;

  return output;
}
