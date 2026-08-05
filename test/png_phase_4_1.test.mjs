/*
 * js_pdf PNG decoder phase 4.1 tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, constants } from 'node:zlib';
import * as Pdf from '../src/index.ts';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) === 0 ? 0 : 0xedb88320);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u32(value) {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function chunk(type, data) {
  const name = [...type].map(character => character.charCodeAt(0));
  return [...u32(data.length), ...name, ...data, ...u32(crc32([...name, ...data]))];
}

function png({ width, height, bitDepth, colorType, scanlines, palette = null, transparency = null, level = 6, strategy }) {
  const ihdr = [
    ...u32(width), ...u32(height), bitDepth, colorType, 0, 0, 0
  ];
  const compressed = deflateSync(Uint8Array.from(scanlines), { level, strategy });
  return Uint8Array.from([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...chunk('IHDR', ihdr),
    ...(palette === null ? [] : chunk('PLTE', palette)),
    ...(transparency === null ? [] : chunk('tRNS', transparency)),
    ...chunk('IDAT', compressed),
    ...chunk('IEND', [])
  ]);
}

test('decodePng reverses all five PNG row filters through dynamic DEFLATE', () => {
  const rows = [
    [10, 20, 30, 40, 50, 60],
    [15, 25, 35, 45, 55, 65],
    [20, 30, 40, 50, 60, 70],
    [25, 35, 45, 55, 65, 75],
    [30, 40, 50, 60, 70, 80]
  ];
  const encoded = [];
  for (let row = 0; row < rows.length; row++) {
    const filter = row;
    encoded.push(filter);
    for (let index = 0; index < 6; index++) {
      const raw = rows[row][index];
      const left = index >= 3 ? rows[row][index - 3] : 0;
      const above = row > 0 ? rows[row - 1][index] : 0;
      const upperLeft = row > 0 && index >= 3 ? rows[row - 1][index - 3] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      if (filter === 2) predictor = above;
      if (filter === 3) predictor = Math.floor((left + above) / 2);
      if (filter === 4) {
        const p = left + above - upperLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - above);
        const pc = Math.abs(p - upperLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? above : upperLeft;
      }
      encoded.push((raw - predictor + 256) & 255);
    }
  }

  const decoded = Pdf.decodePng(png({
    width: 2,
    height: 5,
    bitDepth: 8,
    colorType: 2,
    scanlines: encoded
  }));
  assert.equal(decoded.width, 2);
  assert.equal(decoded.height, 5);
  assert.equal(decoded.hasAlpha, false);
  assert.deepEqual([...decoded.pixels], rows.flatMap(row => [
    row[0], row[1], row[2], 255,
    row[3], row[4], row[5], 255
  ]));
});

test('decodePng accepts stored and fixed-Huffman zlib blocks', () => {
  const source = {
    width: 1,
    height: 1,
    bitDepth: 8,
    colorType: 6,
    scanlines: [0, 9, 19, 29, 39]
  };
  const stored = Pdf.decodePng(png({ ...source, level: 0 }));
  const fixed = Pdf.decodePng(png({ ...source, strategy: constants.Z_FIXED }));
  assert.deepEqual([...stored.pixels], [9, 19, 29, 39]);
  assert.deepEqual([...fixed.pixels], [9, 19, 29, 39]);
  assert.equal(stored.hasAlpha, true);
});

test('decodePng expands packed indexed pixels and palette transparency', () => {
  const decoded = Pdf.decodePng(png({
    width: 4,
    height: 1,
    bitDepth: 2,
    colorType: 3,
    scanlines: [0, 0b00011011],
    palette: [255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255],
    transparency: [255, 128, 0, 255]
  }));
  assert.deepEqual([...decoded.pixels], [
    255, 0, 0, 255,
    0, 255, 0, 128,
    0, 0, 255, 0,
    255, 255, 255, 255
  ]);
  assert.equal(decoded.hasAlpha, true);
});

test('decodePng scatters all seven Adam7 passes', () => {
  const width = 5;
  const height = 5;
  const pixels = Array.from({ length: width * height }, (_, index) => [
    index * 7,
    255 - index * 5,
    index * 3,
    index % 4 === 0 ? 80 : 255
  ]);
  const startsX = [0, 4, 0, 2, 0, 1, 0];
  const startsY = [0, 0, 4, 0, 2, 0, 1];
  const stepsX = [8, 8, 4, 4, 2, 2, 1];
  const stepsY = [8, 8, 8, 4, 4, 2, 2];
  const scanlines = [];
  for (let pass = 0; pass < 7; pass++) {
    for (let y = startsY[pass]; y < height; y += stepsY[pass]) {
      if (startsX[pass] >= width) continue;
      scanlines.push(0);
      for (let x = startsX[pass]; x < width; x += stepsX[pass]) {
        scanlines.push(...pixels[y * width + x]);
      }
    }
  }
  const bytes = png({ width, height, bitDepth: 8, colorType: 6, scanlines });
  // Switch IHDR's interlace byte and repair its CRC.
  bytes[28] = 1;
  const repaired = crc32(bytes.subarray(12, 29));
  bytes.set(u32(repaired), 29);
  const decoded = Pdf.decodePng(bytes);
  assert.deepEqual([...decoded.pixels], pixels.flat());
});

test('decodePng keeps 16-bit transparency comparisons before reducing to 8-bit', () => {
  const decoded = Pdf.decodePng(png({
    width: 2,
    height: 1,
    bitDepth: 16,
    colorType: 0,
    scanlines: [0, 0x12, 0x34, 0x12, 0x35],
    transparency: [0x12, 0x34]
  }));
  assert.deepEqual([...decoded.pixels], [0x12, 0x12, 0x12, 0, 0x12, 0x12, 0x12, 255]);
});

test('PNG image streams register an RGB XObject and a grayscale soft mask', () => {
  const bytes = png({
    width: 2,
    height: 1,
    bitDepth: 8,
    colorType: 6,
    scanlines: [0, 255, 0, 0, 255, 0, 0, 255, 64]
  });
  const image = Pdf.PdfImage.fromPng(bytes);
  const document = new Pdf.Document();
  document.addPage(new Pdf.Page({
    build: () => new Pdf.CustomPaint({
      size: { x: 120, y: 60 },
      painter: canvas => canvas.drawImage(image, 0, 0, 120, 60)
    })
  }));
  const source = String.fromCharCode(...document.save());
  assert.match(source, /\/XObject << \/I1 \d+ 0 R >>/);
  assert.match(source, /\/Subtype \/Image \/Width 2 \/Height 1 \/BitsPerComponent 8 \/ColorSpace \/DeviceGray/);
  assert.match(source, /\/ColorSpace \/DeviceRGB \/SMask \d+ 0 R/);
  assert.match(source, /120 0 0 60 0 [\d.]+ cm\n\/I1 Do/);
});

test('decodePng rejects corrupt chunks and unsupported critical properties', () => {
  const valid = png({ width: 1, height: 1, bitDepth: 8, colorType: 0, scanlines: [0, 127] });
  const corrupt = valid.slice();
  corrupt[29] ^= 1;
  assert.throws(() => Pdf.decodePng(corrupt), /CRC/);

  const interlaced = valid.slice();
  interlaced[28] = 2;
  assert.throws(() => Pdf.decodePng(interlaced), /interlace|CRC/);
});
