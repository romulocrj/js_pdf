/*
 * js_pdf constrained-heap image regression probe.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';

import { decodePng } from '../src/pdf/image/png.ts';
import { PdfImage } from '../src/pdf/obj/image.ts';

function u32(value) {
  return Uint8Array.of(value >>> 24, value >>> 16, value >>> 8, value);
}

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

function chunk(name, data) {
  const type = Uint8Array.from(name, character => character.charCodeAt(0));
  const body = new Uint8Array(type.length + data.length);
  body.set(type);
  body.set(data, type.length);
  const result = new Uint8Array(12 + data.length);
  result.set(u32(data.length));
  result.set(body, 4);
  result.set(u32(crc32(body)), 8 + data.length);
  return result;
}

const width = 4096;
const height = 3515;
let scanlines = new Uint8Array(height * (1 + width * 3));
const compressed = new Uint8Array(deflateSync(scanlines, { level: 1 }));
scanlines = null;
global.gc();

const header = new Uint8Array(13);
header.set(u32(width));
header.set(u32(height), 4);
header.set([8, 2, 0, 0, 0], 8);
const parts = [
  Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
  chunk('IHDR', header),
  chunk('IDAT', compressed),
  chunk('IEND', new Uint8Array(0))
];
const length = parts.reduce((total, part) => total + part.length, 0);
const png = new Uint8Array(length);
let offset = 0;
for (const part of parts) {
  png.set(part, offset);
  offset += part.length;
}

let decoded = decodePng(png);
assert.equal(decoded.pixels.length, width * height * 4);
const image = new PdfImage(decoded);
decoded = null;
global.gc();
assert.equal(image.channel('rgb').length, width * height * 3);
assert.equal(image.hasAlpha, false);
