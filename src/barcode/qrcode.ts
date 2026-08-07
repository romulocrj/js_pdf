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
 *   - barcode/lib/src/qrcode.dart
 *
 * The public adapter follows `barcode`, but the QR encoder below is an
 * independent js_pdf implementation. No source from the separate Dart `qr`
 * library is ported or redistributed here. The encoder implements byte-mode
 * symbols directly from the QR format rules: framing, Reed-Solomon correction,
 * function patterns, masking and penalty selection.
 */

import { Barcode2D, Barcode2DMatrix } from './barcode_2d.ts';
import { BarcodeException } from './barcode_exception.ts';

/** QR error correction choices, ordered from least to most redundancy. */
export const BarcodeQRCorrectionLevel = {
  low: 'low',
  medium: 'medium',
  quartile: 'quartile',
  high: 'high'
} as const;

export type BarcodeQRCorrectionLevel =
  (typeof BarcodeQRCorrectionLevel)[keyof typeof BarcodeQRCorrectionLevel];

interface CorrectionParameters {
  readonly formatBits: number;
  readonly row: number;
}

const CORRECTION: Readonly<Record<BarcodeQRCorrectionLevel, CorrectionParameters>> = {
  low: { formatBits: 1, row: 0 },
  medium: { formatBits: 0, row: 1 },
  quartile: { formatBits: 3, row: 2 },
  high: { formatBits: 2, row: 3 }
};

/*
 * Standard QR block parameters for versions 1..40. Keeping the error-word
 * count and block count separately makes the table auditable and lets the
 * short/long block split be derived instead of stored as another table.
 */
const ERROR_WORDS_PER_BLOCK: readonly (readonly number[])[] = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28,
    30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30,
    30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28,
    26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
    28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28,
    28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30,
    30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28,
    28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
    30, 30, 30, 30, 30]
];

const BLOCK_COUNT: readonly (readonly number[])[] = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8,
    9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16,
    17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45,
    47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21,
    20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59,
    62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25,
    25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70,
    74, 77, 81]
];

class BitWriter {
  private readonly bytes: Uint8Array;
  length = 0;

  constructor(capacity: number) {
    this.bytes = new Uint8Array(capacity);
  }

  get byteLength(): number {
    return (this.length + 7) >>> 3;
  }

  append(value: number, count: number): void {
    if (count < 0 || count > 31 || value >>> count !== 0) {
      throw new RangeError('Invalid QR bit field');
    }
    for (let shift = count - 1; shift >= 0; shift--) {
      this.appendBit(((value >>> shift) & 1) !== 0);
    }
  }

  appendBit(value: boolean): void {
    const byteIndex = this.length >>> 3;
    if (byteIndex >= this.bytes.length) throw new RangeError('QR bit buffer overflow');
    if (value) this.bytes[byteIndex] = this.bytes[byteIndex]! | (0x80 >>> (this.length & 7));
    this.length++;
  }

  appendByte(value: number): void {
    if ((this.length & 7) !== 0) throw new RangeError('QR byte append is not aligned');
    if (this.byteLength >= this.bytes.length) throw new RangeError('QR byte buffer overflow');
    this.bytes[this.byteLength] = value;
    this.length += 8;
  }

  finish(): Uint8Array {
    return this.bytes.subarray(0, this.byteLength);
  }
}

/** QR Code backed by js_pdf's independent byte-mode encoder. */
export class BarcodeQR extends Barcode2D {
  readonly typeNumber: number | null;
  readonly errorCorrectLevel: BarcodeQRCorrectionLevel;

  constructor(
    typeNumber: number | null,
    errorCorrectLevel: BarcodeQRCorrectionLevel
  ) {
    super();
    if (typeNumber !== null
      && (!Number.isInteger(typeNumber) || typeNumber < 1 || typeNumber > 40)) {
      throw new RangeError('QR version must be an integer from 1 to 40');
    }
    if (CORRECTION[errorCorrectLevel] === undefined) {
      throw new RangeError(`Unknown QR correction level: ${errorCorrectLevel}`);
    }
    this.typeNumber = typeNumber;
    this.errorCorrectLevel = errorCorrectLevel;
  }

  override get charSet(): Iterable<number> {
    return Array.from({ length: 256 }, (_unused, index) => index);
  }

  override get name(): string {
    return 'QR-Code';
  }

  override get maxLength(): number {
    return 2953;
  }

  override convert(data: Uint8Array): Barcode2DMatrix {
    const parameters = CORRECTION[this.errorCorrectLevel];
    const version = this.typeNumber ?? smallestVersion(data.length, parameters.row);
    const capacity = dataWordCount(version, parameters.row);
    const countBits = version < 10 ? 8 : 16;
    if (data.length >= 1 << countBits || 4 + countBits + data.length * 8 > capacity * 8) {
      throw new BarcodeException(
        `Unable to fit ${data.length} bytes in QR version ${version} at ${this.errorCorrectLevel} correction`
      );
    }

    const dataWords = frameData(data, version, capacity);
    const allWords = addErrorCorrection(dataWords, version, parameters.row);
    const matrix = new QrMatrix(version, parameters.formatBits, allWords);
    return new Barcode2DMatrix(matrix.size, matrix.size, 1, matrix.pixels());
  }
}

function smallestVersion(byteLength: number, correctionRow: number): number {
  for (let version = 1; version <= 40; version++) {
    const countBits = version < 10 ? 8 : 16;
    if (byteLength < 1 << countBits
      && 4 + countBits + byteLength * 8 <= dataWordCount(version, correctionRow) * 8) {
      return version;
    }
  }
  throw new BarcodeException('Data is too long for a QR symbol');
}

function rawWordCount(version: number): number {
  let modules = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    modules -= (25 * align - 10) * align - 55;
    if (version >= 7) modules -= 36;
  }
  return Math.floor(modules / 8);
}

function dataWordCount(version: number, correctionRow: number): number {
  const errorWords = (ERROR_WORDS_PER_BLOCK[correctionRow] as readonly number[])[version] as number;
  const blocks = (BLOCK_COUNT[correctionRow] as readonly number[])[version] as number;
  return rawWordCount(version) - errorWords * blocks;
}

function frameData(data: Uint8Array, version: number, capacity: number): Uint8Array {
  const bits = new BitWriter(capacity);
  bits.append(0b0100, 4);
  bits.append(data.length, version < 10 ? 8 : 16);
  for (const byte of data) bits.append(byte, 8);

  const capacityBits = capacity * 8;
  for (let count = Math.min(4, capacityBits - bits.length); count > 0; count--) {
    bits.appendBit(false);
  }
  while ((bits.length & 7) !== 0) bits.appendBit(false);

  let toggle = false;
  while (bits.byteLength < capacity) {
    bits.appendByte(toggle ? 0x11 : 0xec);
    toggle = !toggle;
  }
  return bits.finish();
}

function addErrorCorrection(
  data: Uint8Array,
  version: number,
  correctionRow: number
): Uint8Array {
  const blocks = (BLOCK_COUNT[correctionRow] as readonly number[])[version] as number;
  const errorLength = (ERROR_WORDS_PER_BLOCK[correctionRow] as readonly number[])[version] as number;
  const rawLength = rawWordCount(version);
  const shortBlockLength = Math.floor(rawLength / blocks);
  const shortBlockCount = blocks - rawLength % blocks;
  const divisor = reedSolomonDivisor(errorLength);
  const dataBlocks: Uint8Array[] = [];
  const errorBlocks: Uint8Array[] = [];
  let offset = 0;

  for (let block = 0; block < blocks; block++) {
    const dataLength = shortBlockLength - errorLength + (block < shortBlockCount ? 0 : 1);
    const part = data.slice(offset, offset + dataLength);
    offset += dataLength;
    dataBlocks.push(part);
    errorBlocks.push(reedSolomonRemainder(part, divisor));
  }

  const result: number[] = [];
  const longestData = shortBlockLength - errorLength + 1;
  for (let index = 0; index < longestData; index++) {
    for (const block of dataBlocks) {
      if (index < block.length) result.push(block[index] as number);
    }
  }
  for (let index = 0; index < errorLength; index++) {
    for (const block of errorBlocks) result.push(block[index] as number);
  }
  if (result.length !== rawLength || offset !== data.length) {
    throw new Error('Internal QR block length mismatch');
  }
  return Uint8Array.from(result);
}

function reedSolomonDivisor(degree: number): Uint8Array {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMultiply(result[j] as number, root)
        ^ (j + 1 < degree ? result[j + 1] as number : 0);
    }
    root = gfMultiply(root, 2);
  }
  return result;
}

function reedSolomonRemainder(data: Uint8Array, divisor: Uint8Array): Uint8Array {
  const result = new Uint8Array(divisor.length);
  for (const byte of data) {
    const factor = byte ^ (result[0] as number);
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let index = 0; index < result.length; index++) {
      result[index] = (result[index] as number)
        ^ gfMultiply(divisor[index] as number, factor);
    }
  }
  return result;
}

function gfMultiply(left: number, right: number): number {
  let x = left;
  let y = right;
  let result = 0;
  for (let bit = 0; bit < 8; bit++) {
    if ((y & 1) !== 0) result ^= x;
    const carry = (x & 0x80) !== 0;
    x = (x << 1) & 0xff;
    if (carry) x ^= 0x1d;
    y >>>= 1;
  }
  return result;
}

class QrMatrix {
  readonly size: number;
  private readonly modules: boolean[][];
  private readonly functionModules: boolean[][];
  private readonly correctionFormatBits: number;

  constructor(version: number, correctionFormatBits: number, words: Uint8Array) {
    this.size = version * 4 + 17;
    this.correctionFormatBits = correctionFormatBits;
    this.modules = square(this.size, false);
    this.functionModules = square(this.size, false);
    this.drawFunctions(version);
    this.drawWords(words);

    let bestMask = 0;
    let bestPenalty = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      this.applyMask(mask);
      this.drawFormat(mask);
      const penalty = this.penalty();
      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        bestMask = mask;
      }
      this.applyMask(mask);
    }
    this.applyMask(bestMask);
    this.drawFormat(bestMask);
  }

  pixels(): readonly boolean[] {
    const result: boolean[] = [];
    for (const row of this.modules) result.push(...row);
    return result;
  }

  private drawFunctions(version: number): void {
    for (let index = 0; index < this.size; index++) {
      this.setFunction(6, index, index % 2 === 0);
      this.setFunction(index, 6, index % 2 === 0);
    }
    this.drawFinder(3, 3);
    this.drawFinder(this.size - 4, 3);
    this.drawFinder(3, this.size - 4);

    const positions = alignmentPositions(version, this.size);
    const last = positions.length - 1;
    for (let y = 0; y < positions.length; y++) {
      for (let x = 0; x < positions.length; x++) {
        if ((x === 0 && y === 0) || (x === 0 && y === last) || (x === last && y === 0)) {
          continue;
        }
        this.drawAlignment(positions[x] as number, positions[y] as number);
      }
    }
    this.drawFormat(0);
    if (version >= 7) this.drawVersion(version);
  }

  private drawFinder(centerX: number, centerY: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = centerX + dx;
        const y = centerY + dy;
        if (x < 0 || x >= this.size || y < 0 || y >= this.size) continue;
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        this.setFunction(x, y, distance !== 2 && distance !== 4);
      }
    }
  }

  private drawAlignment(centerX: number, centerY: number): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setFunction(centerX + dx, centerY + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  private drawFormat(mask: number): void {
    const value = (this.correctionFormatBits << 3) | mask;
    let remainder = value;
    for (let bit = 0; bit < 10; bit++) {
      remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
    }
    const bits = ((value << 10) | remainder) ^ 0x5412;
    const at = (index: number): boolean => ((bits >>> index) & 1) !== 0;

    for (let index = 0; index <= 5; index++) this.setFunction(8, index, at(index));
    this.setFunction(8, 7, at(6));
    this.setFunction(8, 8, at(7));
    this.setFunction(7, 8, at(8));
    for (let index = 9; index < 15; index++) this.setFunction(14 - index, 8, at(index));

    for (let index = 0; index < 8; index++) this.setFunction(this.size - 1 - index, 8, at(index));
    for (let index = 8; index < 15; index++) this.setFunction(8, this.size - 15 + index, at(index));
    this.setFunction(8, this.size - 8, true);
  }

  private drawVersion(version: number): void {
    let remainder = version;
    for (let bit = 0; bit < 12; bit++) {
      remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
    }
    const bits = (version << 12) | remainder;
    for (let index = 0; index < 18; index++) {
      const value = ((bits >>> index) & 1) !== 0;
      const a = this.size - 11 + index % 3;
      const b = Math.floor(index / 3);
      this.setFunction(a, b, value);
      this.setFunction(b, a, value);
    }
  }

  private drawWords(words: Uint8Array): void {
    let bitIndex = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right--;
      for (let vertical = 0; vertical < this.size; vertical++) {
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? this.size - 1 - vertical : vertical;
        for (let offset = 0; offset < 2; offset++) {
          const x = right - offset;
          if ((this.functionModules[y] as boolean[])[x]) continue;
          const dark = bitIndex < words.length * 8
            && (((words[bitIndex >>> 3] as number) >>> (7 - (bitIndex & 7))) & 1) !== 0;
          (this.modules[y] as boolean[])[x] = dark;
          bitIndex++;
        }
      }
    }
    if (bitIndex < words.length * 8) throw new Error('QR matrix did not consume every data bit');
  }

  private applyMask(mask: number): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (!(this.functionModules[y] as boolean[])[x] && maskBit(mask, x, y)) {
          (this.modules[y] as boolean[])[x] = !(this.modules[y] as boolean[])[x];
        }
      }
    }
  }

  private penalty(): number {
    let result = 0;
    for (let y = 0; y < this.size; y++) result += runPenalty(this.modules[y] as boolean[]);
    for (let x = 0; x < this.size; x++) {
      const column: boolean[] = [];
      for (let y = 0; y < this.size; y++) column.push((this.modules[y] as boolean[])[x] as boolean);
      result += runPenalty(column);
    }

    for (let y = 0; y < this.size - 1; y++) {
      for (let x = 0; x < this.size - 1; x++) {
        const value = (this.modules[y] as boolean[])[x];
        if ((this.modules[y] as boolean[])[x + 1] === value
          && (this.modules[y + 1] as boolean[])[x] === value
          && (this.modules[y + 1] as boolean[])[x + 1] === value) result += 3;
      }
    }

    let dark = 0;
    for (const row of this.modules) for (const value of row) if (value) dark++;
    const total = this.size * this.size;
    result += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
    return result;
  }

  private setFunction(x: number, y: number, value: boolean): void {
    (this.modules[y] as boolean[])[x] = value;
    (this.functionModules[y] as boolean[])[x] = true;
  }
}

function square(size: number, value: boolean): boolean[][] {
  return Array.from({ length: size }, () => new Array<boolean>(size).fill(value));
}

function alignmentPositions(version: number, size: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = version === 32
    ? 26
    : Math.ceil((version * 4 + count * 2 + 1) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let position = size - 7; result.length < count; position -= step) {
    result.splice(1, 0, position);
  }
  return result;
}

function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return (x * y) % 2 + (x * y) % 3 === 0;
    case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
    case 7: return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
    default: throw new RangeError(`Unknown QR mask: ${mask}`);
  }
}

function runPenalty(line: readonly boolean[]): number {
  let result = 0;
  let runLength = 1;
  for (let index = 1; index <= line.length; index++) {
    if (index < line.length && line[index] === line[index - 1]) {
      runLength++;
    } else {
      if (runLength >= 5) result += 3 + runLength - 5;
      runLength = 1;
    }
  }

  for (let index = 0; index + 10 < line.length; index++) {
    let bits = 0;
    for (let offset = 0; offset < 11; offset++) {
      bits = (bits << 1) | (line[index + offset] ? 1 : 0);
    }
    if (bits === 0b00001011101 || bits === 0b10111010000) result += 40;
  }
  return result;
}
