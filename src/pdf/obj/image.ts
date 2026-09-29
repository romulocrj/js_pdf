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
import { PdfDict } from '../format/dict.ts';
import type { PdfStream } from '../format/stream.ts';
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

/** Supplies already encoded RGB JPEG bytes synchronously at serialization time. */
export type PdfImageStreamWriter = (output: PdfStream) => void;

export interface PdfImageJpegStreamOptions {
  readonly width: number;
  readonly height: number;
  readonly length: number;
  readonly write: PdfImageStreamWriter;
  readonly orientation?: PdfImageOrientation;
}

interface EncodedJpegOptions {
  readonly jpeg: Uint8Array;
  readonly info: JpegInfo;
  readonly orientation: PdfImageOrientation;
}

interface DecodedChannelOptions {
  readonly rgb: Uint8Array;
  readonly alpha: Uint8Array | null;
  readonly width: number;
  readonly height: number;
  readonly orientation: PdfImageOrientation;
}

/** Decoded raster resource, independent of any one output document. */
export class PdfImage {
  private readonly rgb: Uint8Array | null;
  private readonly alpha: Uint8Array | null;
  private rgba: Uint8Array | null = null;
  readonly jpeg: Uint8Array | null;
  readonly jpegInfo: JpegInfo | null;
  readonly streamWriter: PdfImageStreamWriter | null;
  readonly streamLength: number | null;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly hasAlpha: boolean;
  readonly orientation: PdfImageOrientation;

  constructor(options: PdfImageOptions | EncodedJpegOptions | DecodedChannelOptions | PdfImageJpegStreamOptions) {
    const encoded = 'jpeg' in options;
    const lazy = 'write' in options;
    const width = encoded ? options.info.width : options.width;
    const height = encoded ? options.info.height : options.height;
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
      throw new RangeError('Image dimensions must be positive integers');
    }
    if (!encoded && 'pixels' in options && options.pixels.length !== width * height * 4) {
      throw new RangeError(`RGBA image needs ${width * height * 4} bytes, received ${options.pixels.length}`);
    }
    if (lazy && (!Number.isSafeInteger(options.length) || options.length <= 0)) {
      throw new RangeError('JPEG stream length must be a positive safe integer');
    }
    if (lazy && typeof options.write !== 'function') throw new TypeError('JPEG stream write must be a function');
    this.streamWriter = lazy ? options.write : null;
    this.streamLength = lazy ? options.length : null;
    const pixelCount = width * height;
    if (encoded || lazy) {
      this.rgb = null;
      this.alpha = null;
    } else if ('rgb' in options) {
      if (options.rgb.length !== pixelCount * 3) {
        throw new RangeError(`RGB image needs ${pixelCount * 3} bytes, received ${options.rgb.length}`);
      }
      if (options.alpha !== null && options.alpha.length !== pixelCount) {
        throw new RangeError(`Alpha image needs ${pixelCount} bytes, received ${options.alpha.length}`);
      }
      this.rgb = options.rgb;
      this.alpha = options.alpha;
    } else {
      const rgb = new Uint8Array(pixelCount * 3);
      const alpha = (options.hasAlpha ?? true) ? new Uint8Array(pixelCount) : null;
      for (let index = 0; index < pixelCount; index++) {
        rgb[index * 3] = options.pixels[index * 4]!;
        rgb[index * 3 + 1] = options.pixels[index * 4 + 1]!;
        rgb[index * 3 + 2] = options.pixels[index * 4 + 2]!;
        if (alpha !== null) alpha[index] = options.pixels[index * 4 + 3]!;
      }
      this.rgb = rgb;
      this.alpha = alpha;
    }
    this.jpeg = encoded ? options.jpeg : null;
    this.jpegInfo = encoded ? options.info : null;
    this.sourceWidth = width;
    this.sourceHeight = height;
    this.hasAlpha = this.alpha !== null;
    this.orientation = options.orientation ?? 'topLeft';
  }

  static fromPng(bytes: Uint8Array, orientation: PdfImageOrientation = 'topLeft'): PdfImage {
    const decoded = decodePng(bytes);
    return new PdfImage({ ...decoded, orientation });
  }

  static fromJpeg(bytes: Uint8Array, orientation?: PdfImageOrientation): PdfImage {
    const jpeg = bytes.slice();
    const info = parseJpeg(jpeg);
    return new PdfImage({ jpeg, info, orientation: orientation ?? info.orientation });
  }

  /** RGB JPEG metadata is trusted; its byte writer is called once per serialization. */
  static jpegStream(options: PdfImageJpegStreamOptions): PdfImage {
    return new PdfImage(options);
  }

  /** RGBA compatibility view, materialized only for callers that request it. */
  get pixels(): Uint8Array | null {
    if (this.rgb === null) return null;
    if (this.rgba === null) {
      const pixelCount = this.sourceWidth * this.sourceHeight;
      const pixels = new Uint8Array(pixelCount * 4);
      for (let index = 0; index < pixelCount; index++) {
        pixels[index * 4] = this.rgb[index * 3]!;
        pixels[index * 4 + 1] = this.rgb[index * 3 + 1]!;
        pixels[index * 4 + 2] = this.rgb[index * 3 + 2]!;
        pixels[index * 4 + 3] = this.alpha?.[index] ?? 255;
      }
      this.rgba = pixels;
    }
    return this.rgba;
  }

  channel(channel: 'rgb' | 'alpha'): Uint8Array {
    if (channel === 'rgb') {
      if (this.rgb === null) throw new RangeError('Encoded images have no decoded RGB channel');
      return this.rgb;
    }
    if (this.alpha === null) throw new RangeError('The image has no separate alpha channel');
    return this.alpha;
  }

  resize(width: number): PdfImage {
    if (this.rgb === null || width === this.sourceWidth) return this;
    const height = Math.max(1, Math.round(this.sourceHeight * width / this.sourceWidth));
    const rgb = new Uint8Array(width * height * 3);
    const alpha = this.alpha === null ? null : new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      const sourceY = Math.min(this.sourceHeight - 1, Math.floor(y * this.sourceHeight / height));
      for (let x = 0; x < width; x++) {
        const sourceX = Math.min(this.sourceWidth - 1, Math.floor(x * this.sourceWidth / width));
        const source = sourceY * this.sourceWidth + sourceX;
        const destination = y * width + x;
        rgb[destination * 3] = this.rgb[source * 3]!;
        rgb[destination * 3 + 1] = this.rgb[source * 3 + 1]!;
        rgb[destination * 3 + 2] = this.rgb[source * 3 + 2]!;
        if (alpha !== null) alpha[destination] = this.alpha![source]!;
      }
    }
    return new PdfImage({ rgb, alpha, width, height, orientation: this.orientation });
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
  private readonly streamWriter: PdfImageStreamWriter | null;
  private readonly streamLength: number | null;

  constructor(
    document: PdfObjectRegistry,
    image: PdfImage,
    channel: 'rgb' | 'alpha'
  ) {
    const jpeg = image.jpeg;
    const lazy = image.streamWriter !== null;
    let data: Uint8Array;
    if (lazy) {
      if (channel === 'alpha') throw new RangeError('A JPEG image has no separate alpha channel');
      data = new Uint8Array(0);
    } else if (jpeg !== null) {
      if (channel === 'alpha') throw new RangeError('A JPEG image has no separate alpha channel');
      data = jpeg;
    } else {
      data = image.channel(channel);
    }
    super(document, '/Image', data);
    this.streamWriter = image.streamWriter;
    this.streamLength = image.streamLength;
    this.params.set('/Width', new PdfNum(image.sourceWidth));
    this.params.set('/Height', new PdfNum(image.sourceHeight));
    this.params.set('/BitsPerComponent', new PdfNum(8));
    const info = image.jpegInfo;
    if (info !== null || lazy) {
      this.params.set('/Intent', new PdfName('/RelativeColorimetric'));
      this.params.set('/Filter', new PdfName('/DCTDecode'));
      this.params.set('/ColorSpace', new PdfName(
        info?.colorSpace === 'gray' ? '/DeviceGray' : info?.colorSpace === 'cmyk' ? '/DeviceCMYK' : '/DeviceRGB'
      ));
      if (info?.inverted) this.params.set('/Decode', PdfArray.fromNum([1, 0, 1, 0, 1, 0, 1, 0]));
    } else {
      this.params.set('/ColorSpace', new PdfName(channel === 'rgb' ? '/DeviceRGB' : '/DeviceGray'));
    }
  }

  protected override writeContent(output: PdfStream): void {
    if (this.streamWriter === null) {
      super.writeContent(output);
      return;
    }
    const params = new PdfDict(this.params.values);
    params.set('/Length', new PdfNum(this.streamLength!));
    params.output(output);
    output.putString('\nstream\n');
    const start = output.offset;
    this.streamWriter(output);
    const written = output.offset - start;
    if (written !== this.streamLength) {
      throw new RangeError(`JPEG stream wrote ${written} bytes; expected ${this.streamLength}`);
    }
    output.putString('\nendstream\n');
  }

  setSoftMask(mask: PdfImageObject): void {
    this.params.set('/SMask', mask.ref());
  }
}
