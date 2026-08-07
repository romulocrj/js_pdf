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
 *
 * Image bytes always come from the caller. Providers resolve synchronously to
 * document-independent `PdfImage` descriptions, so one provider can be reused
 * across documents without retaining a registry from a previous save.
 */

import { reportPdfDiagnostic } from '../pdf/diagnostics.ts';
import { parseJpeg } from '../pdf/image/jpeg.ts';
import type { JpegInfo } from '../pdf/image/jpeg.ts';
import { decodeJpeg } from '../pdf/image/jpeg_decoder.ts';
import { PdfImage } from '../pdf/obj/image.ts';
import type { PdfImageOrientation } from '../pdf/obj/image.ts';
import { PageUnit } from '../pdf/page_format.ts';
import type { PdfPoint } from '../pdf/rect.ts';

/**
 * Pixels above which decoding an image is worth warning about.
 *
 * Four megapixels is far more than any page can show: a full A4 bleed at 300
 * dpi is about 8.7, and the images that trigger this in practice are logos a
 * few points wide that happen to be stored at camera resolution. The cost is
 * paid twice over — once decoding to RGBA, and again holding the samples until
 * the document is written.
 */
const LARGE_IMAGE_PIXELS = 4000000;

/**
 * Warn that `image` is far larger than any page will draw.
 *
 * Silent unless the caller installed a handler; see `pdf/diagnostics.ts` for
 * why the library cannot simply write this somewhere itself.
 */
function reportIfOversized(width: number, height: number): void {
  const pixels = width * height;
  if (pixels < LARGE_IMAGE_PIXELS) return;

  reportPdfDiagnostic(
    `js_pdf (MemoryImage): received a ${width}x${height} image ` +
    `(${Math.round(pixels / 1000000)} megapixels). Every source pixel is embedded ` +
    'at full resolution unless the provider is given a dpi, so pass ' +
    '{ dpi: 150 } to resample it down to what the page actually draws.'
  );
}

function validateDpi(dpi: number | null): number | null {
  if (dpi !== null && (!Number.isFinite(dpi) || dpi <= 0)) {
    throw new RangeError('Image DPI must be positive');
  }
  return dpi;
}

function resizeDecodedImage(image: PdfImage, width: number): PdfImage {
  return image.resize(width);
}

export abstract class ImageProvider {
  readonly dpi: number | null;
  readonly orientation: PdfImageOrientation;
  private readonly sourceWidth: number;
  private readonly sourceHeight: number;
  private readonly cache = new Map<number, PdfImage>();

  protected constructor(
    width: number,
    height: number,
    orientation: PdfImageOrientation,
    dpi: number | null
  ) {
    this.sourceWidth = width;
    this.sourceHeight = height;
    this.orientation = orientation;
    this.dpi = validateDpi(dpi);
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

  protected abstract buildImage(width?: number): PdfImage;

  resolve(size?: PdfPoint, dpi: number | null = null): PdfImage {
    const effectiveDpi = validateDpi(dpi ?? this.dpi);
    if (effectiveDpi === null || size === undefined) {
      let image = this.cache.get(0);
      if (image === undefined) {
        image = this.buildImage();
        this.cache.set(0, image);
      }
      return image;
    }
    if (!Number.isFinite(size.x) || size.x < 0 || !Number.isFinite(size.y) || size.y < 0) {
      throw new RangeError('Image resolve size must be finite and non-negative');
    }
    const width = Math.max(1, Math.trunc(size.x / PageUnit.inch * effectiveDpi));
    let image = this.cache.get(width);
    if (image === undefined) {
      image = this.buildImage(width);
      this.cache.set(width, image);
    }
    return image;
  }
}

export class ImageProxy extends ImageProvider {
  private readonly image: PdfImage;

  constructor(image: PdfImage, { dpi = null }: { readonly dpi?: number | null } = {}) {
    super(image.sourceWidth, image.sourceHeight, image.orientation, dpi);
    this.image = image;
  }

  protected override buildImage(_width?: number): PdfImage {
    return this.image;
  }
}

export interface MemoryImageOptions {
  readonly orientation?: PdfImageOrientation;
  readonly dpi?: number | null;
}

export class MemoryImage extends ImageProvider {
  readonly bytes: Uint8Array;
  private readonly jpegInfo: JpegInfo | null;

  constructor(bytes: Uint8Array, {
    orientation,
    dpi = null
  }: MemoryImageOptions = {}) {
    const stored = bytes.slice();
    let width: number;
    let height: number;
    let jpegInfo: JpegInfo | null = null;
    if (stored[0] === 0xff && stored[1] === 0xd8) {
      jpegInfo = parseJpeg(stored);
      width = jpegInfo.width;
      height = jpegInfo.height;
    } else if (
      stored.length >= 24 &&
      stored[0] === 137 && stored[1] === 80 && stored[2] === 78 && stored[3] === 71 &&
      stored[4] === 13 && stored[5] === 10 && stored[6] === 26 && stored[7] === 10 &&
      stored[12] === 73 && stored[13] === 72 && stored[14] === 68 && stored[15] === 82
    ) {
      width = (
        stored[16]! * 0x1000000 + stored[17]! * 0x10000 +
        stored[18]! * 0x100 + stored[19]!
      ) >>> 0;
      height = (
        stored[20]! * 0x1000000 + stored[21]! * 0x10000 +
        stored[22]! * 0x100 + stored[23]!
      ) >>> 0;
      if (width === 0 || height === 0) throw new RangeError('PNG dimensions must be positive');
    } else {
      throw new TypeError(`Unable to determine image type from ${stored.length} bytes`);
    }
    const resolvedOrientation = orientation ?? jpegInfo?.orientation ?? 'topLeft';
    super(width, height, resolvedOrientation, dpi);
    this.bytes = stored;
    this.jpegInfo = jpegInfo;
    // Worth saying at construction rather than at save: this is where the
    // caller still has the option of handing over a smaller source.
    if (dpi === null) reportIfOversized(width, height);
  }

  protected override buildImage(width?: number): PdfImage {
    if (this.jpegInfo !== null) {
      if (width === undefined) {
        return new PdfImage({
          jpeg: this.bytes,
          info: this.jpegInfo,
          orientation: this.orientation
        });
      }
      const decoded = decodeJpeg(this.bytes, width);
      return new PdfImage({
        rgb: decoded.rgb,
        alpha: null,
        width: decoded.width,
        height: decoded.height,
        orientation: this.orientation
      });
    }
    const image = PdfImage.fromPng(this.bytes, this.orientation);
    return width === undefined ? image : resizeDecodedImage(image, width);
  }
}

export interface RawImageOptions {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly orientation?: PdfImageOrientation;
  readonly dpi?: number | null;
}

export class RawImage extends ImageProvider {
  private readonly image: PdfImage;

  constructor({
    bytes,
    width,
    height,
    orientation = 'topLeft',
    dpi = null
  }: RawImageOptions) {
    const image = new PdfImage({ pixels: bytes.slice(), width, height, orientation, hasAlpha: true });
    super(width, height, orientation, dpi);
    this.image = image;
  }

  protected override buildImage(width?: number): PdfImage {
    return width === undefined ? this.image : resizeDecodedImage(this.image, width);
  }
}
