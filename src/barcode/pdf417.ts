/*
 * Ported to JavaScript from DavBfr/dart_pdf.
 *
 * Original work:
 * Copyright (C) 2017, David PHAM-VAN <dev.nfet.net@gmail.com>
 *
 * JavaScript port:
 * Copyright (C) 2026, Romulo Campos
 *
 * This file has been substantially modified from the original Dart source.
 *
 * Licensed under the Apache License, Version 2.0.
 *
 * Original Dart sources ported into this file:
 *   - barcode/lib/src/pdf417.dart
 */

import { Barcode2D, Barcode2DMatrix } from './barcode_2d.ts';
import { BarcodeException } from './barcode_exception.ts';
import {
  codewords,
  correctionFactors,
  latchToByte,
  latchToBytePadded,
  latchToNumeric,
  latchToText,
  minNumericCount,
  mixedMap,
  paddingCodeword,
  punctMap,
  shiftToByte,
  startWord,
  stopWord
} from './pdf417_codewords.ts';

/**
 * PDF417 error recovery levels.
 *
 * The numeric values are load-bearing: the level indexes the correction-factor
 * table and sets the codeword count, as upstream's enum indices do.
 */
export const Pdf417SecurityLevel = {
  level0: 0,
  level1: 1,
  level2: 2,
  level3: 3,
  level4: 4,
  level5: 5,
  level6: 6,
  level7: 7,
  level8: 8
} as const;

export type Pdf417SecurityLevel =
  (typeof Pdf417SecurityLevel)[keyof typeof Pdf417SecurityLevel];

const MIN_COLS = 2;
const MAX_COLS = 60;
const MAX_ROWS = 60;
const MIN_ROWS = 2;

/** The high-level encoder's mode. */
const ENC_TEXT = 0;
const ENC_NUMERIC = 1;
const ENC_BINARY = 2;

/** The text compaction sub-mode. */
const SUB_UPPER = 0;
const SUB_LOWER = 1;
const SUB_MIXED = 2;
const SUB_PUNCT = 3;

/**
 * PDF417 barcode.
 *
 * A stacked linear format used on transport documents, identification cards
 * and inventory labels.
 */
export class BarcodePDF417 extends Barcode2D {
  /** Height of the bars, in modules. */
  readonly moduleHeight: number;

  /** The width-to-height ratio the layout aims for. */
  readonly preferredRatio: number;

  /** Error recovery level. */
  readonly securityLevel: Pdf417SecurityLevel;

  constructor(
    securityLevel: Pdf417SecurityLevel,
    moduleHeight: number,
    preferredRatio: number
  ) {
    super();
    this.securityLevel = securityLevel;
    this.moduleHeight = moduleHeight;
    this.preferredRatio = preferredRatio;
  }

  override get charSet(): Iterable<number> {
    return Array.from({ length: 256 }, (_unused, index) => index);
  }

  override get name(): string {
    return 'PDF417';
  }

  override get maxLength(): number {
    return 990;
  }

  override convert(data: Uint8Array): Barcode2DMatrix {
    const dataWords = this.highlevelEncode([...data]);

    const dim = this.calcDimensions(
      dataWords.length,
      errorCorrectionWordCount(this.securityLevel)
    );
    if (dim.columns < MIN_COLS || dim.columns > MAX_COLS
      || dim.rows < MIN_ROWS || dim.rows > MAX_ROWS) {
      throw new BarcodeException('Unable to fit data in barcode');
    }

    const codeWords = this.encodeData(dataWords, dim.columns, this.securityLevel);

    const grid: number[][] = [];
    for (let i = 0; i < codeWords.length; i += dim.columns) {
      grid.push(codeWords.slice(i, Math.min(i + dim.columns, codeWords.length)));
    }

    const codes: number[][] = [];

    let rowNum = 0;
    for (const row of grid) {
      const table = rowNum % 3;
      const rowCodes: number[] = [];

      rowCodes.push(startWord);
      rowCodes.push(getCodeword(
        table,
        leftCodeWord(rowNum, dim.rows, dim.columns, this.securityLevel)
      ));

      for (const word of row) {
        rowCodes.push(getCodeword(table, word));
      }

      rowCodes.push(getCodeword(
        table,
        rightCodeWord(rowNum, dim.rows, dim.columns, this.securityLevel)
      ));
      rowCodes.push(stopWord);

      codes.push(rowCodes);

      rowNum++;
    }

    const width = (dim.columns + 4) * 17 + 1;

    return new Barcode2DMatrix(width, dim.rows, this.moduleHeight, renderBarcode(codes));
  }

  private encodeData(
    dataWords: number[],
    columns: number,
    securityLevel: Pdf417SecurityLevel
  ): number[] {
    const dataCount = dataWords.length;
    const ecCount = errorCorrectionWordCount(securityLevel);

    const words = [...dataWords, ...padding(dataCount, ecCount, columns)];
    words.unshift(words.length + 1);

    return [...words, ...computeErrorCorrection(securityLevel, words)];
  }

  private calcDimensions(dataWords: number, eccWords: number): { columns: number; rows: number } {
    let ratio = 0;
    let cols = 0;
    let rows = 0;

    for (let c = MIN_COLS; c <= MAX_COLS; c++) {
      const r = numberOfRows(dataWords, eccWords, c);

      if (r < MIN_ROWS) {
        break;
      }

      if (r > MAX_ROWS) {
        continue;
      }

      if (r !== 0) {
        const newRatio = (17 * c + 69) / (r * this.moduleHeight);

        if (Math.abs(newRatio - this.preferredRatio) < Math.abs(ratio - this.preferredRatio)) {
          ratio = newRatio;
          cols = c;
          rows = r;
          continue;
        }

        break;
      }
    }

    if (rows === 0) {
      cols = MIN_COLS;
      rows = numberOfRows(dataWords, eccWords, cols);
      if (rows < MIN_ROWS) {
        rows = MIN_ROWS;
      }
    }

    return { columns: cols, rows };
  }

  private encodeText(text: number[], submode: number, result: number[]): number {
    let idx = 0;
    const tmp: number[] = [];

    while (idx < text.length) {
      const ch = text[idx] as number;
      switch (submode) {
        case SUB_UPPER:
          if (isAlphaUpper(ch)) {
            tmp.push(ch === 0x20 ? 26 : ch - 0x41);
          } else if (isAlphaLower(ch)) {
            submode = SUB_LOWER;
            tmp.push(27); // lower latch
            continue;
          } else if (mixedMap.has(ch)) {
            submode = SUB_MIXED;
            tmp.push(28); // mixed latch
            continue;
          } else {
            tmp.push(29); // punctuation switch
            tmp.push(punctMap.get(ch) as number);
          }
          break;
        case SUB_LOWER:
          if (isAlphaLower(ch)) {
            tmp.push(ch === 0x20 ? 26 : ch - 0x61);
          } else if (isAlphaUpper(ch)) {
            tmp.push(27); // upper switch
            tmp.push(ch - 0x41);
          } else if (mixedMap.has(ch)) {
            submode = SUB_MIXED;
            tmp.push(28); // mixed latch
            continue;
          } else {
            tmp.push(29); // punctuation switch
            tmp.push(punctMap.get(ch) as number);
          }
          break;
        case SUB_MIXED:
          if (mixedMap.has(ch)) {
            tmp.push(mixedMap.get(ch) as number);
          } else if (isAlphaUpper(ch)) {
            submode = SUB_UPPER;
            tmp.push(28); // upper latch
            continue;
          } else if (isAlphaLower(ch)) {
            submode = SUB_LOWER;
            tmp.push(27); // lower latch
            continue;
          } else {
            if (idx + 1 < text.length && punctMap.has(text[idx + 1] as number)) {
              submode = SUB_PUNCT;
              tmp.push(25); // punctuation latch
              continue;
            }
            tmp.push(29); // punctuation switch
            tmp.push(punctMap.get(ch) as number);
          }
          break;
        default: // SUB_PUNCT
          if (punctMap.has(ch)) {
            tmp.push(punctMap.get(ch) as number);
          } else {
            submode = SUB_UPPER;
            tmp.push(29); // upper latch
            continue;
          }
      }
      idx++;
    }

    // Two five-bit values pack into one base-30 codeword.
    let h = 0;
    let i = 0;
    for (const val of tmp) {
      if (i % 2 !== 0) {
        h = h * 30 + val;
        result.push(h);
      } else {
        h = val;
      }
      i++;
    }
    if (tmp.length % 2 !== 0) {
      result.push(h * 30 + 29);
    }
    return submode;
  }

  private consecutiveTextCount(msg: number[]): number {
    let result = 0;

    let i = 0;
    for (const ch of msg) {
      const numericCount = consecutiveDigitCount(msg.slice(i));
      if (numericCount >= minNumericCount || (numericCount === 0 && !isText(ch))) {
        break;
      }

      result++;
      i++;
    }
    return result;
  }

  private consecutiveBinaryCount(msg: number[]): number {
    let result = 0;

    for (let i = 0; i < msg.length; i++) {
      if (consecutiveDigitCount(msg.slice(i)) >= minNumericCount) {
        break;
      }
      if (this.consecutiveTextCount(msg.slice(i)) > 5) {
        break;
      }
      result++;
    }
    return result;
  }

  private highlevelEncode(data: number[]): number[] {
    const words: number[] = [];
    let encodingMode = ENC_TEXT;
    let textSubMode = SUB_UPPER;

    while (data.length > 0) {
      const numericCount = consecutiveDigitCount(data);
      if (numericCount >= minNumericCount || numericCount === data.length) {
        words.push(latchToNumeric);
        encodingMode = ENC_NUMERIC;
        textSubMode = SUB_UPPER;
        words.push(...encodeNumeric(data.slice(0, numericCount)));
        data = data.slice(numericCount);
      } else {
        const textCount = this.consecutiveTextCount(data);
        if (textCount >= 5 || textCount === data.length) {
          if (encodingMode !== ENC_TEXT) {
            words.push(latchToText);
            encodingMode = ENC_TEXT;
            textSubMode = SUB_UPPER;
          }
          const txtData: number[] = [];
          textSubMode = this.encodeText(data.slice(0, textCount), textSubMode, txtData);
          words.push(...txtData);
          data = data.slice(textCount);
        } else {
          let binaryCount = this.consecutiveBinaryCount(data);
          if (binaryCount === 0) {
            binaryCount = 1;
          }
          const bytes = data.slice(0, binaryCount);
          if (bytes.length !== 1 || encodingMode !== ENC_TEXT) {
            encodingMode = ENC_BINARY;
            textSubMode = SUB_UPPER;
          }
          words.push(...encodeBinary(bytes, encodingMode));
          data = data.slice(binaryCount);
        }
      }
    }

    return words;
  }
}

function errorCorrectionWordCount(level: Pdf417SecurityLevel): number {
  return 1 << (level + 1);
}

function numberOfRows(m: number, k: number, c: number): number {
  let r = Math.floor((m + 1 + k) / c) + 1;
  if (c * r >= m + 1 + k + c) {
    r--;
  }
  return r;
}

function leftCodeWord(
  rowNum: number,
  rows: number,
  columns: number,
  securityLevel: Pdf417SecurityLevel
): number {
  const tableId = rowNum % 3;

  let x = 0;
  switch (tableId) {
    case 0:
      x = Math.floor((rows - 3) / 3);
      break;
    case 1:
      x = securityLevel * 3;
      x += (rows - 1) % 3;
      break;
    case 2:
      x = columns - 1;
      break;
  }

  return 30 * Math.floor(rowNum / 3) + x;
}

function rightCodeWord(
  rowNum: number,
  rows: number,
  columns: number,
  securityLevel: Pdf417SecurityLevel
): number {
  const tableId = rowNum % 3;

  let x = 0;
  switch (tableId) {
    case 0:
      x = columns - 1;
      break;
    case 1:
      x = Math.floor((rows - 1) / 3);
      break;
    case 2:
      x = securityLevel * 3;
      x += (rows - 1) % 3;
      break;
  }

  return 30 * Math.floor(rowNum / 3) + x;
}

function padding(dataCount: number, ecCount: number, columns: number): number[] {
  const totalCount = dataCount + ecCount + 1;
  const mod = totalCount % columns;

  if (mod > 0) {
    return new Array<number>(columns - mod).fill(paddingCodeword);
  }

  return [];
}

function addBits(b: number, count: number): boolean[] {
  const bits: boolean[] = [];
  for (let i = count - 1; i >= 0; i--) {
    bits.push(((b >> i) & 1) === 1);
  }
  return bits;
}

function renderBarcode(codes: number[][]): boolean[] {
  const pixels: boolean[] = [];
  for (const row of codes) {
    const lastIdx = row.length - 1;
    let i = 0;
    for (const col of row) {
      // The stop word carries one extra module, which closes the row.
      pixels.push(...addBits(col, i === lastIdx ? 18 : 17));
      i++;
    }
  }
  return pixels;
}

function computeErrorCorrection(
  level: Pdf417SecurityLevel,
  data: readonly number[]
): number[] {
  const factors = correctionFactors[level] as readonly number[];
  const count = errorCorrectionWordCount(level);
  const ecWords = new Array<number>(count).fill(0);

  for (const value of data) {
    const temp = (value + (ecWords[0] as number)) % 929;

    for (let i = count - 1; i >= 0; i--) {
      let add = 0;

      if (i > 0) {
        add = ecWords[count - i] as number;
      }

      ecWords[count - 1 - i] = (add + 929 - ((temp * (factors[i] as number)) % 929)) % 929;
    }
  }

  for (let key = 0; key < ecWords.length; key++) {
    const word = ecWords[key] as number;
    if (word > 0) {
      ecWords[key] = 929 - word;
    }
  }

  return ecWords;
}

function getCodeword(tableId: number, word: number): number {
  return (codewords[tableId] as readonly number[])[word] as number;
}

function consecutiveDigitCount(data: readonly number[]): number {
  let cnt = 0;
  for (const r of data) {
    if (r < 0x30 || r > 0x39) {
      break;
    }
    cnt++;
  }
  return cnt;
}

function encodeNumeric(digits: readonly number[]): number[] {
  const result: number[] = [];
  const digitCount = digits.length;
  let chunkCount = Math.floor(digitCount / 44);
  if (digitCount % 44 !== 0) {
    chunkCount++;
  }

  for (let i = 0; i < chunkCount; i++) {
    const start = i * 44;
    const end = Math.min(start + 44, digitCount);
    const chunk = digits.slice(start, end);

    // The leading '1' preserves leading zeros through the base-900 conversion.
    let chunkNum = BigInt(`1${String.fromCharCode(...chunk)}`);

    const cws: number[] = [];

    while (chunkNum > 0n) {
      const cw = chunkNum % 900n;
      chunkNum = chunkNum / 900n;
      cws.unshift(Number(cw));
    }

    result.push(...cws);
  }

  return result;
}

function isText(ch: number): boolean {
  return ch === 0x9 || ch === 0xa || ch === 0xd || (ch >= 32 && ch <= 126);
}

function isAlphaUpper(ch: number): boolean {
  return ch === 0x20 || (ch >= 0x41 && ch <= 0x5a);
}

function isAlphaLower(ch: number): boolean {
  return ch === 0x20 || (ch >= 0x61 && ch <= 0x7a);
}

function encodeBinary(data: readonly number[], startmode: number): number[] {
  const result: number[] = [];
  const count = data.length;

  if (count === 1 && startmode === ENC_TEXT) {
    result.push(shiftToByte);
  } else if (count % 6 === 0) {
    result.push(latchToByte);
  } else {
    result.push(latchToBytePadded);
  }

  let idx = 0;
  // Six bytes pack into five base-900 codewords. Upstream shifts left by 8 six
  // times, which needs 48 bits; JavaScript's bitwise operators are 32-bit, so
  // the shift is written as a multiplication. 48 bits is exact in a double.
  if (count >= 6) {
    const words = new Array<number>(5).fill(0);
    while (count - idx >= 6) {
      let t = 0;
      for (let i = 0; i < 6; i++) {
        t = t * 256;
        t += data[idx + i] as number;
      }
      for (let i = 0; i < 5; i++) {
        words[4 - i] = t % 900;
        t = Math.floor(t / 900);
      }
      result.push(...words);
      idx += 6;
    }
  }
  // The remaining bytes go through unpacked.
  for (let i = idx; i < count; i++) {
    result.push((data[i] as number) & 0xff);
  }

  return result;
}
