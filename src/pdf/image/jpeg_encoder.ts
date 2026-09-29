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
 *   - pdf/lib/src/widgets/image_provider.dart
 *   - image/lib/src/formats/jpeg_encoder.dart
 *
 * Baseline 4:4:4 quality-90 encoding translated from brendan-duncan/image
 * at 82ae9fc9053a9d9d899a3a353908e4cce3b925f1 (MIT).
 * Copyright (c) 2013-2022 Brendan Duncan. See NOTICE for the MIT license.
 * That encoder derives from Andreas Ritter's javascript-jpeg-encoder
 * Copyright (c) 2008, Adobe Systems Incorporated (BSD-3-Clause);
 * ported and optimized by Andreas Ritter, 2009. See NOTICE.
 *
 * Only the RGB path used by dart_pdf's DPI reduction is retained. The port
 * uses typed workspaces and computes coefficient categories on demand rather
 * than retaining upstream's 65,535 small code arrays. EXIF is never copied;
 * orientation remains in the image resource, not baked into the pixels.
 */

import { PdfStream } from '../format/stream.ts';

const _zigzag = new Uint8Array([
  0, 1, 5, 6, 14, 15, 27, 28, 2, 4, 7, 13, 16, 26, 29, 42,
  3, 8, 12, 17, 25, 30, 41, 43, 9, 11, 18, 24, 31, 40, 44, 53,
  10, 19, 23, 32, 39, 45, 52, 54, 20, 22, 33, 38, 46, 51, 55, 60,
  21, 34, 37, 47, 50, 56, 59, 61, 35, 36, 48, 49, 57, 58, 62, 63,
]);

const stdDcLuminanceNrCodes = new Uint8Array([
  0, 0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0,
  0,
]);

const stdDcLuminanceValues = new Uint8Array([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
]);

const stdAcLuminanceNrCodes = new Uint8Array([
  0, 0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1,
  0x7d,
]);

const stdAcLuminanceValues = new Uint8Array([
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
  0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
  0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
  0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
  0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
  0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
  0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
]);

const stdDcChrominanceNrCodes = new Uint8Array([
  0, 0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0,
  0,
]);

const stdDcChrominanceValues = new Uint8Array([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
]);

const stdAcChrominanceNrCodes = new Uint8Array([
  0, 0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2,
  0x77,
]);

const stdAcChrominanceValues = new Uint8Array([
  0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71,
  0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0,
  0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
  0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48,
  0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68,
  0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
  0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5,
  0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3,
  0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
  0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
]);

const yqt = new Uint8Array([
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
]);

const uvqt = new Uint8Array([
  17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99,
  24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
]);

const aasf = new Float64Array([
  1.0, 1.387039845, 1.306562965, 1.175875602, 1.0, 0.785694958, 0.541196100, 0.275899379,
]);

function transform(data: Float32Array): void {
  // Pass 1: process rows.
  let dataOff = 0;
  for (let i = 0; i < 8; ++i) {
    const d0 = data[dataOff]!;
    const d1 = data[dataOff + 1]!;
    const d2 = data[dataOff + 2]!;
    const d3 = data[dataOff + 3]!;
    const d4 = data[dataOff + 4]!;
    const d5 = data[dataOff + 5]!;
    const d6 = data[dataOff + 6]!;
    const d7 = data[dataOff + 7]!;

    const tmp0 = d0 + d7;
    const tmp7 = d0 - d7;
    const tmp1 = d1 + d6;
    const tmp6 = d1 - d6;
    const tmp2 = d2 + d5;
    const tmp5 = d2 - d5;
    const tmp3 = d3 + d4;
    const tmp4 = d3 - d4;

    // Even part
    let tmp10 = tmp0 + tmp3; // phase 2
    const tmp13 = tmp0 - tmp3;
    let tmp11 = tmp1 + tmp2;
    let tmp12 = tmp1 - tmp2;

    data[dataOff] = tmp10 + tmp11; // phase 3
    data[dataOff + 4] = tmp10 - tmp11;

    const z1 = (tmp12 + tmp13) * 0.707106781; // c4
    data[dataOff + 2] = tmp13 + z1; // phase 5
    data[dataOff + 6] = tmp13 - z1;

    // Odd part
    tmp10 = tmp4 + tmp5; // phase 2
    tmp11 = tmp5 + tmp6;
    tmp12 = tmp6 + tmp7;

    // The rotator is modified from fig 4-8 to avoid extra negations.
    const z5 = (tmp10 - tmp12) * 0.382683433; // c6
    const z2 = 0.541196100 * tmp10 + z5; // c2 - c6
    const z4 = 1.306562965 * tmp12 + z5; // c2 + c6
    const z3 = tmp11 * 0.707106781; // c4

    const z11 = tmp7 + z3; // phase 5
    const z13 = tmp7 - z3;

    data[dataOff + 5] = z13 + z2; // phase 6
    data[dataOff + 3] = z13 - z2;
    data[dataOff + 1] = z11 + z4;
    data[dataOff + 7] = z11 - z4;

    dataOff += 8; // advance pointer to next row
  }

  // Pass 2: process columns.
  dataOff = 0;
  for (let i = 0; i < 8; ++i) {
    const d0 = data[dataOff]!;
    const d1 = data[dataOff + 8]!;
    const d2 = data[dataOff + 16]!;
    const d3 = data[dataOff + 24]!;
    const d4 = data[dataOff + 32]!;
    const d5 = data[dataOff + 40]!;
    const d6 = data[dataOff + 48]!;
    const d7 = data[dataOff + 56]!;

    const tmp0p2 = d0 + d7;
    const tmp7p2 = d0 - d7;
    const tmp1p2 = d1 + d6;
    const tmp6p2 = d1 - d6;
    const tmp2p2 = d2 + d5;
    const tmp5p2 = d2 - d5;
    const tmp3p2 = d3 + d4;
    const tmp4p2 = d3 - d4;

    // Even part
    let tmp10p2 = tmp0p2 + tmp3p2; // phase 2
    const tmp13p2 = tmp0p2 - tmp3p2;
    let tmp11p2 = tmp1p2 + tmp2p2;
    let tmp12p2 = tmp1p2 - tmp2p2;

    data[dataOff] = tmp10p2 + tmp11p2; // phase 3
    data[dataOff + 32] = tmp10p2 - tmp11p2;

    const z1p2 = (tmp12p2 + tmp13p2) * 0.707106781; // c4
    data[dataOff + 16] = tmp13p2 + z1p2; // phase 5
    data[dataOff + 48] = tmp13p2 - z1p2;

    // Odd part
    tmp10p2 = tmp4p2 + tmp5p2; // phase 2
    tmp11p2 = tmp5p2 + tmp6p2;
    tmp12p2 = tmp6p2 + tmp7p2;

    // The rotator is modified from fig 4-8 to avoid extra negations.
    const z5p2 = (tmp10p2 - tmp12p2) * 0.382683433; // c6
    const z2p2 = 0.541196100 * tmp10p2 + z5p2; // c2 - c6
    const z4p2 = 1.306562965 * tmp12p2 + z5p2; // c2 + c6
    const z3p2 = tmp11p2 * 0.707106781; // c4

    const z11p2 = tmp7p2 + z3p2; // phase 5
    const z13p2 = tmp7p2 - z3p2;

    data[dataOff + 40] = z13p2 + z2p2; // phase 6
    data[dataOff + 24] = z13p2 - z2p2;
    data[dataOff + 8] = z11p2 + z4p2;
    data[dataOff + 56] = z11p2 - z4p2;

    dataOff++; // advance pointer to next column
  }

}

interface HuffmanTable {
  readonly codes: Uint16Array;
  readonly lengths: Uint8Array;
}

function huffman(counts: Uint8Array, values: Uint8Array): HuffmanTable {
  const codes = new Uint16Array(256);
  const lengths = new Uint8Array(256);
  let code = 0;
  let position = 0;
  for (let length = 1; length <= 16; length++) {
    for (let index = 0; index < counts[length]!; index++) {
      const value = values[position++]!;
      codes[value] = code++;
      lengths[value] = length;
    }
    code *= 2;
  }
  return { codes, lengths };
}

const ydc = huffman(stdDcLuminanceNrCodes, stdDcLuminanceValues);
const yac = huffman(stdAcLuminanceNrCodes, stdAcLuminanceValues);
const uvdc = huffman(stdDcChrominanceNrCodes, stdDcChrominanceValues);
const uvac = huffman(stdAcChrominanceNrCodes, stdAcChrominanceValues);

/** RGB-only baseline JPEG, with upstream's quality 90 and default 4:4:4 sampling. */
export function encodeJpeg(rgb: Uint8Array, width: number, height: number): Uint8Array {
  if (!Number.isInteger(width) || width <= 0 || width > 65535 ||
      !Number.isInteger(height) || height <= 0 || height > 65535) {
    throw new RangeError('JPEG dimensions must be integers between 1 and 65535');
  }
  if (rgb.length !== width * height * 3) throw new RangeError('JPEG RGB channel length does not match dimensions');

  const output = new PdfStream();
  const word = (value: number): void => {
    output.putByte(value >>> 8);
    output.putByte(value & 255);
  };
  const yTable = new Uint8Array(64);
  const uvTable = new Uint8Array(64);
  const fy = new Float32Array(64);
  const fuv = new Float32Array(64);
  for (let i = 0; i < 64; i++) {
    // Quality 90 maps to a scale factor of 20 in the upstream quantizer.
    yTable[_zigzag[i]!] = Math.max(1, Math.floor((yqt[i]! * 20 + 50) / 100));
    uvTable[_zigzag[i]!] = Math.max(1, Math.floor((uvqt[i]! * 20 + 50) / 100));
  }
  for (let i = 0; i < 64; i++) {
    const scale = aasf[i >> 3]! * aasf[i & 7]! * 8;
    fy[i] = 1 / (yTable[_zigzag[i]!]! * scale);
    fuv[i] = 1 / (uvTable[_zigzag[i]!]! * scale);
  }

  word(0xffd8);
  word(0xffe0);
  word(16);
  output.putBytes(new Uint8Array([74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]));
  word(0xffdb);
  word(132);
  output.putByte(0);
  output.putBytes(yTable);
  output.putByte(1);
  output.putBytes(uvTable);
  word(0xffc0);
  word(17);
  output.putByte(8);
  word(height);
  word(width);
  output.putBytes(new Uint8Array([3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]));
  word(0xffc4);
  word(0x01a2);
  const table = (id: number, counts: Uint8Array, values: Uint8Array): void => {
    output.putByte(id);
    output.putBytes(counts.subarray(1));
    output.putBytes(values);
  };
  table(0, stdDcLuminanceNrCodes, stdDcLuminanceValues);
  table(0x10, stdAcLuminanceNrCodes, stdAcLuminanceValues);
  table(1, stdDcChrominanceNrCodes, stdDcChrominanceValues);
  table(0x11, stdAcChrominanceNrCodes, stdAcChrominanceValues);
  word(0xffda);
  word(12);
  output.putBytes(new Uint8Array([3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0]));

  let byte = 0;
  let bitPosition = 7;
  const bits = (value: number, length: number): void => {
    for (let shift = length - 1; shift >= 0; shift--) {
      byte |= ((value >>> shift) & 1) << bitPosition;
      if (--bitPosition < 0) {
        output.putByte(byte);
        if (byte === 255) output.putByte(0);
        byte = 0;
        bitPosition = 7;
      }
    }
  };
  const symbol = (table: HuffmanTable, value: number): void => {
    bits(table.codes[value]!, table.lengths[value]!);
  };
  const coefficients = new Int32Array(64);
  const block = (data: Float32Array, factors: Float32Array, previous: number,
    dc: HuffmanTable, ac: HuffmanTable): number => {
    transform(data);
    for (let i = 0; i < 64; i++) {
      const value = data[i]! * factors[i]!;
      coefficients[_zigzag[i]!] = Math.trunc(value + (value > 0 ? 0.5 : -0.5));
    }
    const current = coefficients[0]!;
    const difference = current - previous;
    const magnitude = 32 - Math.clz32(Math.abs(difference));
    symbol(dc, magnitude);
    if (magnitude > 0) bits(difference < 0 ? difference + (1 << magnitude) - 1 : difference, magnitude);
    let end = 63;
    while (end > 0 && coefficients[end] === 0) end--;
    let zeros = 0;
    for (let i = 1; i <= end; i++) {
      const value = coefficients[i]!;
      if (value === 0) { zeros++; continue; }
      while (zeros >= 16) { symbol(ac, 0xf0); zeros -= 16; }
      const size = 32 - Math.clz32(Math.abs(value));
      symbol(ac, (zeros << 4) | size);
      bits(value < 0 ? value + (1 << size) - 1 : value, size);
      zeros = 0;
    }
    if (end < 63) symbol(ac, 0);
    return current;
  };

  const ydu = new Float32Array(64);
  const udu = new Float32Array(64);
  const vdu = new Float32Array(64);
  let dcy = 0;
  let dcu = 0;
  let dcv = 0;
  for (let y = 0; y < height; y += 8) {
    for (let x = 0; x < width; x += 8) {
      for (let pos = 0; pos < 64; pos++) {
        const row = Math.min(y + (pos >> 3), height - 1);
        const col = Math.min(x + (pos & 7), width - 1);
        const offset = (row * width + col) * 3;
        const r = rgb[offset]!;
        const g = rgb[offset + 1]!;
        const b = rgb[offset + 2]!;
        // Upstream's integer RGB-to-YUV transform, without the lookup array.
        ydu[pos] = ((19595 * r + 38470 * g + 7471 * b + 0x8000) >> 16) - 128;
        udu[pos] = ((-11059 * r - 21709 * g + 32768 * b + 0x807fff) >> 16) - 128;
        vdu[pos] = ((32768 * r - 27439 * g - 5329 * b + 0x807fff) >> 16) - 128;
      }
      dcy = block(ydu, fy, dcy, ydc, yac);
      dcu = block(udu, fuv, dcu, uvdc, uvac);
      dcv = block(vdu, fuv, dcv, uvdc, uvac);
    }
  }
  if (bitPosition < 7) bits((1 << (bitPosition + 1)) - 1, bitPosition + 1);
  word(0xffd9);
  return output.take();
}
