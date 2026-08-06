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

export interface JpegInfo {
  readonly width: number;
  readonly height: number;
  readonly bitsPerComponent: number;
  readonly components: number;
  readonly colorSpace: JpegColorSpace;
  readonly inverted: boolean;
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
    inverted: colorSpace === 'cmyk' && adobeTransform !== 0
  };
}
