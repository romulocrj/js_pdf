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
 *   - pdf/lib/src/pdf/obj/image.dart
 *
 * Upstream delegates raster decoding to package:image. The JavaScript port
 * implements PNG and its zlib/DEFLATE payload directly so callers only need to
 * supply bytes. All standard colour types, legal sample depths, transparency,
 * row filters and Adam7 passes are decoded to 8-bit RGBA pixels.
 */

export interface DecodedPng {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly hasAlpha: boolean;
}

class BitReader {
  private readonly bytes: Uint8Array;
  private offset = 0;
  private bits = 0;
  private bitCount = 0;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  read(count: number): number {
    while (this.bitCount < count) {
      const byte = this.bytes[this.offset++];
      if (byte === undefined) throw new RangeError('Truncated DEFLATE stream');
      this.bits |= byte << this.bitCount;
      this.bitCount += 8;
    }
    const mask = count === 0 ? 0 : (1 << count) - 1;
    const value = this.bits & mask;
    this.bits >>>= count;
    this.bitCount -= count;
    return value;
  }

  align(): void {
    this.bits = 0;
    this.bitCount = 0;
  }
}

interface HuffmanTable {
  readonly symbols: ReadonlyMap<number, number>;
  readonly maxBits: number;
}

function reverseBits(value: number, count: number): number {
  let result = 0;
  for (let index = 0; index < count; index++) {
    result = (result << 1) | ((value >>> index) & 1);
  }
  return result;
}

function huffman(lengths: readonly number[]): HuffmanTable {
  let maxBits = 0;
  for (const length of lengths) maxBits = Math.max(maxBits, length);
  if (maxBits === 0) throw new RangeError('Empty DEFLATE Huffman table');

  const counts = new Array<number>(maxBits + 1).fill(0);
  for (const length of lengths) {
    if (length > 0) counts[length] = (counts[length] ?? 0) + 1;
  }
  const next = new Array<number>(maxBits + 1).fill(0);
  let code = 0;
  for (let bits = 1; bits <= maxBits; bits++) {
    code = (code + (counts[bits - 1] ?? 0)) << 1;
    next[bits] = code;
  }

  const symbols = new Map<number, number>();
  for (let symbol = 0; symbol < lengths.length; symbol++) {
    const length = lengths[symbol] ?? 0;
    if (length === 0) continue;
    const canonical = next[length] ?? 0;
    next[length] = canonical + 1;
    symbols.set(length * 65536 + reverseBits(canonical, length), symbol);
  }
  return { symbols, maxBits };
}

function readSymbol(reader: BitReader, table: HuffmanTable): number {
  let code = 0;
  for (let length = 1; length <= table.maxBits; length++) {
    code |= reader.read(1) << (length - 1);
    const symbol = table.symbols.get(length * 65536 + code);
    if (symbol !== undefined) return symbol;
  }
  throw new RangeError('Invalid DEFLATE Huffman code');
}

const LENGTH_BASE = Object.freeze([
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
  35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258
]);
const LENGTH_EXTRA = Object.freeze([
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
  3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0
]);
const DISTANCE_BASE = Object.freeze([
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
  257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193,
  12289, 16385, 24577
]);
const DISTANCE_EXTRA = Object.freeze([
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
  7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13
]);

/**
 * The inflate accumulator: a byte buffer that doubles as it fills.
 *
 * It has to be a `Uint8Array` and not an array of numbers. A decoded scanline
 * buffer runs to the size of the image — a 4096x3515 RGBA source is 57.6 million
 * bytes — and holding that many elements as an array costs eight bytes each
 * before the growth copy doubles it again. That is half a gigabyte to decode one
 * logo, which is enough to exhaust a constrained heap outright; as bytes, the
 * same buffer is the 57.6 MB it actually is.
 */
class ByteBuffer {
  private bytes = new Uint8Array(1024);
  length = 0;

  private ensure(extra: number): void {
    if (this.length + extra <= this.bytes.length) return;
    let size = this.bytes.length * 2;
    while (size < this.length + extra) size *= 2;
    const grown = new Uint8Array(size);
    grown.set(this.bytes.subarray(0, this.length));
    this.bytes = grown;
  }

  push(byte: number): void {
    this.ensure(1);
    this.bytes[this.length++] = byte;
  }

  append(bytes: Uint8Array): void {
    this.ensure(bytes.length);
    this.bytes.set(bytes, this.length);
    this.length += bytes.length;
  }

  /** Copy `length` bytes from `distance` back, one at a time. */
  repeat(distance: number, length: number): void {
    this.ensure(length);
    let source = this.length - distance;
    // Deliberately byte by byte: DEFLATE allows the run to overlap what it is
    // still writing, which is how a repeating pattern is encoded.
    for (let index = 0; index < length; index++) {
      this.bytes[this.length++] = this.bytes[source++]!;
    }
  }

  /** The filled prefix, without copying. Valid until the next write. */
  view(): Uint8Array {
    return this.bytes.subarray(0, this.length);
  }
}

function compressedBlock(
  reader: BitReader,
  output: ByteBuffer,
  literals: HuffmanTable,
  distances: HuffmanTable
): void {
  for (;;) {
    const symbol = readSymbol(reader, literals);
    if (symbol < 256) {
      output.push(symbol);
      continue;
    }
    if (symbol === 256) return;
    const lengthIndex = symbol - 257;
    const baseLength = LENGTH_BASE[lengthIndex];
    const lengthBits = LENGTH_EXTRA[lengthIndex];
    if (baseLength === undefined || lengthBits === undefined) {
      throw new RangeError(`Invalid DEFLATE length symbol ${symbol}`);
    }
    const length = baseLength + reader.read(lengthBits);
    const distanceSymbol = readSymbol(reader, distances);
    const baseDistance = DISTANCE_BASE[distanceSymbol];
    const distanceBits = DISTANCE_EXTRA[distanceSymbol];
    if (baseDistance === undefined || distanceBits === undefined) {
      throw new RangeError(`Invalid DEFLATE distance symbol ${distanceSymbol}`);
    }
    const distance = baseDistance + reader.read(distanceBits);
    if (distance > output.length) throw new RangeError('DEFLATE distance exceeds output');
    output.repeat(distance, length);
  }
}

function fixedTables(): readonly [HuffmanTable, HuffmanTable] {
  const literalLengths = new Array<number>(288);
  for (let symbol = 0; symbol <= 143; symbol++) literalLengths[symbol] = 8;
  for (let symbol = 144; symbol <= 255; symbol++) literalLengths[symbol] = 9;
  for (let symbol = 256; symbol <= 279; symbol++) literalLengths[symbol] = 7;
  for (let symbol = 280; symbol <= 287; symbol++) literalLengths[symbol] = 8;
  return [huffman(literalLengths), huffman(new Array<number>(32).fill(5))];
}

function dynamicTables(reader: BitReader): readonly [HuffmanTable, HuffmanTable] {
  const literalCount = reader.read(5) + 257;
  const distanceCount = reader.read(5) + 1;
  const codeCount = reader.read(4) + 4;
  const order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
  const codeLengths = new Array<number>(19).fill(0);
  for (let index = 0; index < codeCount; index++) {
    codeLengths[order[index]!] = reader.read(3);
  }
  const codes = huffman(codeLengths);
  const lengths: number[] = [];
  const total = literalCount + distanceCount;
  while (lengths.length < total) {
    const symbol = readSymbol(reader, codes);
    if (symbol <= 15) {
      lengths.push(symbol);
    } else if (symbol === 16) {
      if (lengths.length === 0) throw new RangeError('DEFLATE repeat has no previous length');
      const repeat = reader.read(2) + 3;
      const previous = lengths[lengths.length - 1]!;
      for (let index = 0; index < repeat; index++) lengths.push(previous);
    } else if (symbol === 17) {
      const repeat = reader.read(3) + 3;
      for (let index = 0; index < repeat; index++) lengths.push(0);
    } else if (symbol === 18) {
      const repeat = reader.read(7) + 11;
      for (let index = 0; index < repeat; index++) lengths.push(0);
    } else {
      throw new RangeError(`Invalid DEFLATE code-length symbol ${symbol}`);
    }
    if (lengths.length > total) throw new RangeError('DEFLATE code lengths overflow');
  }
  const literals = huffman(lengths.slice(0, literalCount));
  const distanceLengths = lengths.slice(literalCount);
  const distances = distanceLengths.every(length => length === 0)
    ? [1, ...distanceLengths.slice(1)]
    : distanceLengths;
  return [literals, huffman(distances)];
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  // 5552 is the most iterations that cannot overflow the accumulators, so the
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

/** Inflate a complete RFC 1950 zlib stream containing RFC 1951 blocks. */
export function inflateZlib(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 6) throw new RangeError('Truncated zlib stream');
  const cmf = bytes[0]!;
  const flags = bytes[1]!;
  if ((cmf & 15) !== 8 || (cmf >>> 4) > 7) throw new RangeError('Unsupported zlib method');
  if (((cmf << 8) | flags) % 31 !== 0) throw new RangeError('Invalid zlib header');
  if ((flags & 32) !== 0) throw new RangeError('Preset zlib dictionaries are unsupported');

  const reader = new BitReader(bytes.subarray(2, bytes.length - 4));
  const output = new ByteBuffer();
  let final = false;
  while (!final) {
    final = reader.read(1) === 1;
    const type = reader.read(2);
    if (type === 0) {
      reader.align();
      const length = reader.read(8) | (reader.read(8) << 8);
      const complement = reader.read(8) | (reader.read(8) << 8);
      if (((length ^ 0xffff) & 0xffff) !== complement) {
        throw new RangeError('Invalid stored DEFLATE block length');
      }
      for (let index = 0; index < length; index++) output.push(reader.read(8));
    } else if (type === 1) {
      const [literals, distances] = fixedTables();
      compressedBlock(reader, output, literals, distances);
    } else if (type === 2) {
      const [literals, distances] = dynamicTables(reader);
      compressedBlock(reader, output, literals, distances);
    } else {
      throw new RangeError('Reserved DEFLATE block type');
    }
  }

  const expected = (
    (bytes[bytes.length - 4]! << 24) |
    (bytes[bytes.length - 3]! << 16) |
    (bytes[bytes.length - 2]! << 8) |
    bytes[bytes.length - 1]!
  ) >>> 0;
  if (adler32(output.view()) !== expected) throw new RangeError('Invalid zlib checksum');
  return output.view();
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! * 0x1000000) +
    (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) +
    bytes[offset + 3]!
  ) >>> 0;
}

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let index = start; index < end; index++) {
    crc ^= bytes[index]!;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) === 0 ? 0 : 0xedb88320);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function paeth(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft;
  const dl = Math.abs(estimate - left);
  const da = Math.abs(estimate - above);
  const dul = Math.abs(estimate - upperLeft);
  return dl <= da && dl <= dul ? left : da <= dul ? above : upperLeft;
}

function unfilter(
  data: Uint8Array,
  offset: number,
  width: number,
  height: number,
  bitsPerPixel: number,
  consume: (row: Uint8Array, y: number) => void
): number {
  const rowBytes = Math.ceil(width * bitsPerPixel / 8);
  const bytesPerPixel = Math.max(1, Math.ceil(bitsPerPixel / 8));
  let previous = new Uint8Array(rowBytes);
  let row = new Uint8Array(rowBytes);
  let cursor = offset;
  for (let y = 0; y < height; y++) {
    const filter = data[cursor++];
    if (filter === undefined || filter > 4) throw new RangeError(`Invalid PNG filter ${String(filter)}`);
    if (cursor + rowBytes > data.length) throw new RangeError('Truncated PNG scanline');
    for (let index = 0; index < rowBytes; index++) {
      const raw = data[cursor++]!;
      const left = index >= bytesPerPixel ? row[index - bytesPerPixel]! : 0;
      const upper = previous[index]!;
      const upperLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel]! : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = upper;
      else if (filter === 3) predictor = Math.floor((left + upper) / 2);
      else if (filter === 4) predictor = paeth(left, upper, upperLeft);
      row[index] = (raw + predictor) & 255;
    }
    consume(row, y);
    const swap = previous;
    previous = row;
    row = swap;
  }
  return cursor;
}

function sample(row: Uint8Array, index: number, bitDepth: number): number {
  if (bitDepth === 8) return row[index]!;
  if (bitDepth === 16) return (row[index * 2]! << 8) | row[index * 2 + 1]!;
  const perByte = 8 / bitDepth;
  const shift = (perByte - 1 - (index % perByte)) * bitDepth;
  return (row[Math.floor(index / perByte)]! >>> shift) & ((1 << bitDepth) - 1);
}

function sample8(value: number, bitDepth: number): number {
  if (bitDepth === 16) return value >>> 8;
  if (bitDepth === 8) return value;
  return Math.round(value * 255 / ((1 << bitDepth) - 1));
}

function writePixels(
  target: Uint8Array,
  row: Uint8Array,
  passWidth: number,
  y: number,
  xStart: number,
  xStep: number,
  colorType: number,
  bitDepth: number,
  palette: Uint8Array | null,
  transparency: Uint8Array | null
): boolean {
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : 4;
  let hasAlpha = false;
  const transparentGray = transparency !== null && colorType === 0
    ? (transparency[0]! << 8) | transparency[1]!
    : -1;
  const transparentRgb = transparency !== null && colorType === 2
    ? [
        (transparency[0]! << 8) | transparency[1]!,
        (transparency[2]! << 8) | transparency[3]!,
        (transparency[4]! << 8) | transparency[5]!
      ]
    : null;

  for (let x = 0; x < passWidth; x++) {
    const values = new Array<number>(channels);
    for (let channel = 0; channel < channels; channel++) {
      values[channel] = sample(row, x * channels + channel, bitDepth);
    }
    let red = 0;
    let green = 0;
    let blue = 0;
    let alpha = 255;
    if (colorType === 0 || colorType === 4) {
      red = green = blue = sample8(values[0]!, bitDepth);
      if (colorType === 4) alpha = sample8(values[1]!, bitDepth);
      else if (values[0] === transparentGray) alpha = 0;
    } else if (colorType === 2 || colorType === 6) {
      red = sample8(values[0]!, bitDepth);
      green = sample8(values[1]!, bitDepth);
      blue = sample8(values[2]!, bitDepth);
      if (colorType === 6) alpha = sample8(values[3]!, bitDepth);
      else if (
        transparentRgb !== null &&
        values[0] === transparentRgb[0] &&
        values[1] === transparentRgb[1] &&
        values[2] === transparentRgb[2]
      ) alpha = 0;
    } else {
      const paletteIndex = values[0]!;
      const paletteOffset = paletteIndex * 3;
      if (palette === null || paletteOffset + 2 >= palette.length) {
        throw new RangeError(`PNG palette index ${paletteIndex} is out of range`);
      }
      red = palette[paletteOffset]!;
      green = palette[paletteOffset + 1]!;
      blue = palette[paletteOffset + 2]!;
      alpha = transparency?.[paletteIndex] ?? 255;
    }
    const offset = (y + xStart + x * xStep) * 4;
    target[offset] = red;
    target[offset + 1] = green;
    target[offset + 2] = blue;
    target[offset + 3] = alpha;
    if (alpha !== 255) hasAlpha = true;
  }
  return hasAlpha;
}

function passSize(size: number, start: number, step: number): number {
  return size <= start ? 0 : Math.floor((size - start + step - 1) / step);
}

/** Decode PNG bytes to row-major RGBA pixels without using a host codec. */
export function decodePng(bytes: Uint8Array): DecodedPng {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || signature.some((byte, index) => bytes[index] !== byte)) {
    throw new TypeError('Invalid PNG signature');
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = 0;
  let palette: Uint8Array | null = null;
  let transparency: Uint8Array | null = null;
  const idat = new ByteBuffer();
  let sawHeader = false;
  let sawEnd = false;
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = readU32(bytes, offset);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcOffset = dataEnd;
    if (dataEnd + 4 > bytes.length) throw new RangeError('Truncated PNG chunk');
    const typeCodes = bytes.subarray(offset + 4, offset + 8);
    let type = '';
    for (const code of typeCodes) type += String.fromCharCode(code);
    const expectedCrc = readU32(bytes, crcOffset);
    if (crc32(bytes, offset + 4, dataEnd) !== expectedCrc) {
      throw new RangeError(`Invalid PNG CRC for ${type}`);
    }
    const data = bytes.subarray(dataStart, dataEnd);
    if (type === 'IHDR') {
      if (sawHeader || length !== 13 || offset !== 8) throw new RangeError('Invalid PNG IHDR');
      width = readU32(data, 0);
      height = readU32(data, 4);
      bitDepth = data[8]!;
      colorType = data[9]!;
      if (width === 0 || height === 0) throw new RangeError('PNG dimensions must be positive');
      if (data[10] !== 0 || data[11] !== 0) throw new RangeError('Unsupported PNG compression or filter method');
      interlace = data[12]!;
      if (interlace !== 0 && interlace !== 1) throw new RangeError(`Unsupported PNG interlace method ${interlace}`);
      const validDepths = colorType === 0
        ? [1, 2, 4, 8, 16]
        : colorType === 3
          ? [1, 2, 4, 8]
          : [8, 16];
      if (![0, 2, 3, 4, 6].includes(colorType) || !validDepths.includes(bitDepth)) {
        throw new RangeError(`Unsupported PNG colour type ${colorType} at ${bitDepth} bits`);
      }
      sawHeader = true;
    } else if (type === 'PLTE') {
      palette = data.slice();
    } else if (type === 'tRNS') {
      transparency = data.slice();
    } else if (type === 'IDAT') {
      idat.append(data);
    } else if (type === 'IEND') {
      sawEnd = true;
      offset = dataEnd + 4;
      break;
    } else if ((typeCodes[0]! & 32) === 0) {
      throw new RangeError(`Unsupported critical PNG chunk ${type}`);
    }
    offset = dataEnd + 4;
  }
  if (!sawHeader || !sawEnd || idat.length === 0) throw new RangeError('Incomplete PNG file');
  if (colorType === 3 && palette === null) throw new RangeError('Indexed PNG has no palette');

  const inflated = inflateZlib(idat.view());
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : 4;
  const bitsPerPixel = channels * bitDepth;
  const pixels = new Uint8Array(width * height * 4);
  pixels.fill(255);
  let cursor = 0;
  let hasAlpha = false;

  if (interlace === 0) {
    cursor = unfilter(inflated, cursor, width, height, bitsPerPixel, (row, y) => {
      hasAlpha = writePixels(
        pixels, row, width, y * width, 0, 1,
        colorType, bitDepth, palette, transparency
      ) || hasAlpha;
    });
  } else {
    const startsX = [0, 4, 0, 2, 0, 1, 0];
    const startsY = [0, 0, 4, 0, 2, 0, 1];
    const stepsX = [8, 8, 4, 4, 2, 2, 1];
    const stepsY = [8, 8, 8, 4, 4, 2, 2];
    for (let pass = 0; pass < 7; pass++) {
      const passWidth = passSize(width, startsX[pass]!, stepsX[pass]!);
      const passHeight = passSize(height, startsY[pass]!, stepsY[pass]!);
      if (passWidth === 0 || passHeight === 0) continue;
      cursor = unfilter(inflated, cursor, passWidth, passHeight, bitsPerPixel, (row, y) => {
        const targetY = startsY[pass]! + y * stepsY[pass]!;
        hasAlpha = writePixels(
          pixels, row, passWidth, targetY * width,
          startsX[pass]!, stepsX[pass]!, colorType, bitDepth, palette, transparency
        ) || hasAlpha;
      });
    }
  }
  if (cursor !== inflated.length) throw new RangeError('PNG scanline data has trailing bytes');
  return { width, height, pixels, hasAlpha };
}
