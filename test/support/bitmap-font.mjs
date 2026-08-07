/*
 * js_pdf CBLC/CBDT test fixture builder.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import { deflateSync } from 'node:zlib';
import { TtfParser } from '../../src/pdf/font/ttf_parser.ts';

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

/** A valid one-pixel RGBA PNG used as the bitmap glyph payload. */
export function onePixelPng() {
  const compressed = deflateSync(Uint8Array.from([0, 255, 0, 0, 255]));
  return Uint8Array.from([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...chunk('IHDR', [...u32(1), ...u32(1), 8, 6, 0, 0, 0]),
    ...chunk('IDAT', compressed),
    ...chunk('IEND', [])
  ]);
}

function writeTag(bytes, offset, tag) {
  for (let index = 0; index < 4; index++) bytes[offset + index] = tag.charCodeAt(index);
}

/** Add one format-17 PNG strike without changing the font's outline tables. */
export function withBitmapGlyph(source, codePoint, png = onePixelPng()) {
  const parsed = new TtfParser(source);
  const glyph = parsed.charToGlyphIndexMap.get(codePoint);
  if (glyph === undefined) throw new RangeError(`The fixture font has no U+${codePoint.toString(16)}`);

  const sourceView = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const tableCount = sourceView.getUint16(4);
  const directoryEnd = 12 + tableCount * 16;
  const directoryGrowth = 32;
  const cblcOffset = source.length + directoryGrowth;
  const cblcLength = 80;
  const cbdtOffset = cblcOffset + cblcLength;
  const cbdtLength = 4 + 9 + png.length;
  const bytes = new Uint8Array(cbdtOffset + cbdtLength);

  bytes.set(source.subarray(0, directoryEnd), 0);
  bytes.set(source.subarray(directoryEnd), directoryEnd + directoryGrowth);
  const view = new DataView(bytes.buffer);
  view.setUint16(4, tableCount + 2);
  for (let index = 0; index < tableCount; index++) {
    const record = 12 + index * 16;
    view.setUint32(record + 8, sourceView.getUint32(record + 8) + directoryGrowth);
  }

  const cblcRecord = directoryEnd;
  writeTag(bytes, cblcRecord, 'CBLC');
  view.setUint32(cblcRecord + 8, cblcOffset);
  view.setUint32(cblcRecord + 12, cblcLength);
  const cbdtRecord = directoryEnd + 16;
  writeTag(bytes, cbdtRecord, 'CBDT');
  view.setUint32(cbdtRecord + 8, cbdtOffset);
  view.setUint32(cbdtRecord + 12, cbdtLength);

  view.setUint32(cblcOffset, 0x00030000);
  view.setUint32(cblcOffset + 4, 1);
  const size = cblcOffset + 8;
  view.setUint32(size, 56);
  view.setUint32(size + 4, 24);
  view.setUint32(size + 8, 1);
  view.setInt8(size + 12, 1);
  view.setInt8(size + 13, 0);
  view.setUint16(size + 40, glyph);
  view.setUint16(size + 42, glyph);
  view.setUint8(size + 44, 1);
  view.setUint8(size + 45, 1);
  view.setUint8(size + 46, 32);

  const array = cblcOffset + 56;
  view.setUint16(array, glyph);
  view.setUint16(array + 2, glyph);
  view.setUint32(array + 4, 8);
  const subtable = array + 8;
  view.setUint16(subtable, 1);
  view.setUint16(subtable + 2, 17);
  view.setUint32(subtable + 4, 4);
  view.setUint32(subtable + 8, 0);
  view.setUint32(subtable + 12, 9 + png.length);

  view.setUint32(cbdtOffset, 0x00030000);
  const bitmap = cbdtOffset + 4;
  view.setUint8(bitmap, 1);
  view.setUint8(bitmap + 1, 1);
  view.setInt8(bitmap + 2, 0);
  view.setInt8(bitmap + 3, 1);
  view.setUint8(bitmap + 4, 1);
  view.setUint32(bitmap + 5, png.length);
  bytes.set(png, bitmap + 9);

  return bytes;
}
