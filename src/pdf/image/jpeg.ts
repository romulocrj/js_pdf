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
 *   - pdf/lib/src/pdf/exif.dart
 *
 * Only metadata needed to embed a JPEG is parsed. The compressed image
 * payload is never decoded or rewritten.
 */

export type JpegColorSpace = 'gray' | 'rgb' | 'cmyk';
export type JpegOrientation =
  | 'topLeft'
  | 'topRight'
  | 'bottomRight'
  | 'bottomLeft'
  | 'leftTop'
  | 'rightTop'
  | 'rightBottom'
  | 'leftBottom';

export interface JpegInfo {
  readonly width: number;
  readonly height: number;
  readonly bitsPerComponent: number;
  readonly components: number;
  readonly colorSpace: JpegColorSpace;
  readonly inverted: boolean;
  readonly orientation: JpegOrientation;
}

const SOF_MARKERS = Object.freeze([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
]);

const DCT_SOF_MARKERS = Object.freeze([0xc0, 0xc1, 0xc2]);

function u16(bytes: Uint8Array, offset: number): number {
  const high = bytes[offset];
  const low = bytes[offset + 1];
  if (high === undefined || low === undefined) throw new RangeError('Truncated JPEG segment');
  return (high << 8) | low;
}

function exifOrientation(bytes: Uint8Array, start: number, end: number): JpegOrientation | null {
  if (
    end - start < 14 ||
    bytes[start] !== 0x45 || bytes[start + 1] !== 0x78 ||
    bytes[start + 2] !== 0x69 || bytes[start + 3] !== 0x66 ||
    bytes[start + 4] !== 0 || bytes[start + 5] !== 0
  ) return null;

  const tiff = start + 6;
  const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
  const big = bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d;
  if (!little && !big) return null;
  const read16 = (offset: number): number | null => {
    if (offset < tiff || offset + 2 > end) return null;
    return little
      ? bytes[offset]! | (bytes[offset + 1]! << 8)
      : (bytes[offset]! << 8) | bytes[offset + 1]!;
  };
  const read32 = (offset: number): number | null => {
    if (offset < tiff || offset + 4 > end) return null;
    return little
      ? (bytes[offset]! + bytes[offset + 1]! * 0x100 + bytes[offset + 2]! * 0x10000 + bytes[offset + 3]! * 0x1000000) >>> 0
      : (bytes[offset]! * 0x1000000 + bytes[offset + 1]! * 0x10000 + bytes[offset + 2]! * 0x100 + bytes[offset + 3]!) >>> 0;
  };
  if (read16(tiff + 2) !== 42) return null;
  const firstIfd = read32(tiff + 4);
  if (firstIfd === null) return null;
  const directory = tiff + firstIfd;
  const count = read16(directory);
  if (count === null || directory + 2 + count * 12 > end) return null;
  const orientations: readonly JpegOrientation[] = [
    'topLeft', 'topRight', 'bottomRight', 'bottomLeft',
    'leftTop', 'rightTop', 'rightBottom', 'leftBottom'
  ];
  for (let index = 0; index < count; index++) {
    const entry = directory + 2 + index * 12;
    if (read16(entry) !== 0x0112 || read16(entry + 2) !== 3 || read32(entry + 4) !== 1) continue;
    const value = read16(entry + 8);
    return value === null ? null : orientations[value - 1] ?? null;
  }
  return null;
}

/** Read JPEG dimensions and colour metadata without decoding pixels. */
export function parseJpeg(bytes: Uint8Array): JpegInfo {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new TypeError('Invalid JPEG start marker');
  }

  let offset = 2;
  let width = 0;
  let height = 0;
  let bitsPerComponent = 0;
  let components = 0;
  let adobeTransform: number | null = null;
  let orientation: JpegOrientation = 'topLeft';
  let foundFrame = false;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) throw new RangeError(`Invalid JPEG marker at offset ${offset}`);
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === undefined) throw new RangeError('Truncated JPEG marker');
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;

    const length = u16(bytes, offset);
    if (length < 2) throw new RangeError(`Invalid JPEG segment length ${length}`);
    const dataStart = offset + 2;
    const dataEnd = offset + length;
    if (dataEnd > bytes.length) throw new RangeError('Truncated JPEG segment');

    if (SOF_MARKERS.includes(marker)) {
      if (!DCT_SOF_MARKERS.includes(marker)) {
        throw new RangeError(`Unsupported JPEG frame marker 0x${marker.toString(16)}`);
      }
      if (length < 8) throw new RangeError('Truncated JPEG frame');
      bitsPerComponent = bytes[dataStart]!;
      height = u16(bytes, dataStart + 1);
      width = u16(bytes, dataStart + 3);
      components = bytes[dataStart + 5]!;
      const expectedLength = 8 + components * 3;
      if (length < expectedLength) throw new RangeError('Truncated JPEG component table');
      foundFrame = true;
    } else if (marker === 0xe1) {
      orientation = exifOrientation(bytes, dataStart, dataEnd) ?? orientation;
    } else if (
      marker === 0xee &&
      length >= 14 &&
      bytes[dataStart] === 0x41 &&
      bytes[dataStart + 1] === 0x64 &&
      bytes[dataStart + 2] === 0x6f &&
      bytes[dataStart + 3] === 0x62 &&
      bytes[dataStart + 4] === 0x65
    ) {
      adobeTransform = bytes[dataStart + 11]!;
    }
    offset = dataEnd;
  }

  if (!foundFrame) throw new RangeError('Unable to find a JPEG frame');
  if (width <= 0 || height <= 0) throw new RangeError('JPEG dimensions must be positive');
  if (bitsPerComponent !== 8) throw new RangeError(`Unsupported JPEG precision ${bitsPerComponent}`);
  const colorSpace = components === 1 ? 'gray' : components === 3 ? 'rgb' : components === 4 ? 'cmyk' : null;
  if (colorSpace === null) throw new RangeError(`Unsupported JPEG component count ${components}`);
  return {
    width,
    height,
    bitsPerComponent,
    components,
    colorSpace,
    inverted: colorSpace === 'cmyk' && adobeTransform !== 0,
    orientation
  };
}
