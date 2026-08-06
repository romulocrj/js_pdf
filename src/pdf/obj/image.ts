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
 * Upstream makes `PdfImage` an indirect object immediately. Pages in this port
 * are painted before their final object registry exists, so `PdfImage` is an
 * immutable resource description. `PdfDocument` materializes it once on first
 * use, just as it does for deferred fonts.
 */

import { decodePng } from '../image/png.ts';
import { parseJpeg } from '../image/jpeg.ts';
import type { JpegInfo } from '../image/jpeg.ts';
import { PdfArray } from '../format/array.ts';
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

interface EncodedJpegOptions {
  readonly jpeg: Uint8Array;
  readonly info: JpegInfo;
  readonly orientation: PdfImageOrientation;
}

/** Decoded raster resource, independent of any one output document. */
export class PdfImage {
  readonly pixels: Uint8Array | null;
  readonly jpeg: Uint8Array | null;
  readonly jpegInfo: JpegInfo | null;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly hasAlpha: boolean;
  readonly orientation: PdfImageOrientation;

  constructor(options: PdfImageOptions | EncodedJpegOptions) {
    const encoded = 'jpeg' in options;
    const width = encoded ? options.info.width : options.width;
    const height = encoded ? options.info.height : options.height;
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
      throw new RangeError('Image dimensions must be positive integers');
    }
    if (!encoded && options.pixels.length !== width * height * 4) {
      throw new RangeError(`RGBA image needs ${width * height * 4} bytes, received ${options.pixels.length}`);
    }
    this.pixels = encoded ? null : options.pixels.slice();
    this.jpeg = encoded ? options.jpeg.slice() : null;
    this.jpegInfo = encoded ? options.info : null;
    this.sourceWidth = width;
    this.sourceHeight = height;
    this.hasAlpha = encoded ? false : Boolean(options.hasAlpha ?? true);
    this.orientation = options.orientation ?? 'topLeft';
  }

  static fromPng(bytes: Uint8Array, orientation: PdfImageOrientation = 'topLeft'): PdfImage {
    const decoded = decodePng(bytes);
    return new PdfImage({ ...decoded, orientation });
  }

  static fromJpeg(bytes: Uint8Array, orientation: PdfImageOrientation = 'topLeft'): PdfImage {
    return new PdfImage({ jpeg: bytes, info: parseJpeg(bytes), orientation });
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
    const jpeg = image.jpeg;
    let data: Uint8Array;
    if (jpeg !== null) {
      if (channel === 'alpha') throw new RangeError('A JPEG image has no separate alpha channel');
      data = jpeg;
    } else {
      const pixels = image.pixels!;
      const pixelCount = image.sourceWidth * image.sourceHeight;
      data = new Uint8Array(pixelCount * (channel === 'rgb' ? 3 : 1));
      for (let index = 0; index < pixelCount; index++) {
        if (channel === 'rgb') {
          data[index * 3] = pixels[index * 4]!;
          data[index * 3 + 1] = pixels[index * 4 + 1]!;
          data[index * 3 + 2] = pixels[index * 4 + 2]!;
        } else {
          data[index] = pixels[index * 4 + 3]!;
        }
      }
    }
    super(document, '/Image', data);
    this.params.set('/Width', new PdfNum(image.sourceWidth));
    this.params.set('/Height', new PdfNum(image.sourceHeight));
    this.params.set('/BitsPerComponent', new PdfNum(8));
    const info = image.jpegInfo;
    if (info !== null) {
      this.params.set('/Intent', new PdfName('/RelativeColorimetric'));
      this.params.set('/Filter', new PdfName('/DCTDecode'));
      this.params.set('/ColorSpace', new PdfName(
        info.colorSpace === 'gray' ? '/DeviceGray' : info.colorSpace === 'cmyk' ? '/DeviceCMYK' : '/DeviceRGB'
      ));
      if (info.inverted) this.params.set('/Decode', PdfArray.fromNum([1, 0, 1, 0, 1, 0, 1, 0]));
    } else {
      this.params.set('/ColorSpace', new PdfName(channel === 'rgb' ? '/DeviceRGB' : '/DeviceGray'));
    }
  }

  setSoftMask(mask: PdfImageObject): void {
    this.params.set('/SMask', mask.ref());
  }
}
