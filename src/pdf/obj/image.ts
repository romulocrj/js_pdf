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
 *   - pdf/lib/src/pdf/obj/image.dart
 *
 * Upstream makes `PdfImage` an indirect object immediately. Pages in this port
 * are painted before their final object registry exists, so `PdfImage` is an
 * immutable resource description. `PdfDocument` materializes it once on first
 * use, just as it does for deferred fonts.
 */

import { decodePng } from '../image/png.ts';
import { PdfName } from '../format/name.ts';
import { PdfNum } from '../format/num.ts';
import type { PdfObjectRegistry } from './object.ts';
import { PdfXObject } from './xobject.ts';

export type PdfImageOrientation =
  | 'topLeft'
  | 'topRight'
  | 'bottomRight'
  | 'bottomLeft'
  | 'leftTop'
  | 'rightTop'
  | 'rightBottom'
  | 'leftBottom';

export interface PdfImageOptions {
  readonly pixels: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly hasAlpha?: boolean;
  readonly orientation?: PdfImageOrientation;
}

/** Decoded raster resource, independent of any one output document. */
export class PdfImage {
  readonly pixels: Uint8Array;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly hasAlpha: boolean;
  readonly orientation: PdfImageOrientation;

  constructor({
    pixels,
    width,
    height,
    hasAlpha = true,
    orientation = 'topLeft'
  }: PdfImageOptions) {
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
      throw new RangeError('Image dimensions must be positive integers');
    }
    if (pixels.length !== width * height * 4) {
      throw new RangeError(`RGBA image needs ${width * height * 4} bytes, received ${pixels.length}`);
    }
    this.pixels = pixels.slice();
    this.sourceWidth = width;
    this.sourceHeight = height;
    this.hasAlpha = Boolean(hasAlpha);
    this.orientation = orientation;
  }

  static fromPng(bytes: Uint8Array, orientation: PdfImageOrientation = 'topLeft'): PdfImage {
    const decoded = decodePng(bytes);
    return new PdfImage({ ...decoded, orientation });
  }

  get width(): number {
    return this.orientation === 'leftTop' ||
      this.orientation === 'rightTop' ||
      this.orientation === 'rightBottom' ||
      this.orientation === 'leftBottom'
      ? this.sourceHeight
      : this.sourceWidth;
  }

  get height(): number {
    return this.orientation === 'leftTop' ||
      this.orientation === 'rightTop' ||
      this.orientation === 'rightBottom' ||
      this.orientation === 'leftBottom'
      ? this.sourceWidth
      : this.sourceHeight;
  }
}

/** The final `/Subtype /Image` stream created inside one PDF registry. */
export class PdfImageObject extends PdfXObject {
  constructor(
    document: PdfObjectRegistry,
    image: PdfImage,
    channel: 'rgb' | 'alpha'
  ) {
    const pixelCount = image.sourceWidth * image.sourceHeight;
    const data = new Uint8Array(pixelCount * (channel === 'rgb' ? 3 : 1));
    for (let index = 0; index < pixelCount; index++) {
      if (channel === 'rgb') {
        data[index * 3] = image.pixels[index * 4]!;
        data[index * 3 + 1] = image.pixels[index * 4 + 1]!;
        data[index * 3 + 2] = image.pixels[index * 4 + 2]!;
      } else {
        data[index] = image.pixels[index * 4 + 3]!;
      }
    }
    super(document, '/Image', data);
    this.params.set('/Width', new PdfNum(image.sourceWidth));
    this.params.set('/Height', new PdfNum(image.sourceHeight));
    this.params.set('/BitsPerComponent', new PdfNum(8));
    this.params.set('/ColorSpace', new PdfName(channel === 'rgb' ? '/DeviceRGB' : '/DeviceGray'));
  }

  setSoftMask(mask: PdfImageObject): void {
    this.params.set('/SMask', mask.ref());
  }
}
