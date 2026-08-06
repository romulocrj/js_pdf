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
function reportIfOversized(image: PdfImage): void {
  const pixels = image.sourceWidth * image.sourceHeight;
  if (pixels < LARGE_IMAGE_PIXELS) return;

  reportPdfDiagnostic(
    `js_pdf: decoded a ${image.sourceWidth}x${image.sourceHeight} image ` +
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
  const pixels = image.pixels;
  if (pixels === null || width === image.sourceWidth) return image;

  const height = Math.max(1, Math.round(image.sourceHeight * width / image.sourceWidth));
  const resized = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sourceY = Math.min(image.sourceHeight - 1, Math.floor(y * image.sourceHeight / height));
    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(image.sourceWidth - 1, Math.floor(x * image.sourceWidth / width));
      const source = (sourceY * image.sourceWidth + sourceX) * 4;
      const destination = (y * width + x) * 4;
      resized[destination] = pixels[source]!;
      resized[destination + 1] = pixels[source + 1]!;
      resized[destination + 2] = pixels[source + 2]!;
      resized[destination + 3] = pixels[source + 3]!;
    }
  }
  return new PdfImage({
    pixels: resized,
    width,
    height,
    orientation: image.orientation,
    hasAlpha: image.hasAlpha
  });
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
  private readonly image: PdfImage;

  constructor(bytes: Uint8Array, {
    orientation = 'topLeft',
    dpi = null
  }: MemoryImageOptions = {}) {
    let image: PdfImage;
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      image = PdfImage.fromJpeg(bytes, orientation);
    } else if (
      bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
    ) {
      image = PdfImage.fromPng(bytes, orientation);
    } else {
      throw new TypeError(`Unable to determine image type from ${bytes.length} bytes`);
    }
    super(image.sourceWidth, image.sourceHeight, orientation, dpi);
    this.bytes = bytes.slice();
    this.image = image;
    // Worth saying at construction rather than at save: this is where the
    // caller still has the option of handing over a smaller source.
    if (dpi === null) reportIfOversized(image);
  }

  protected override buildImage(width?: number): PdfImage {
    return width === undefined ? this.image : resizeDecodedImage(this.image, width);
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
    const image = new PdfImage({ pixels: bytes, width, height, orientation, hasAlpha: true });
    super(width, height, orientation, dpi);
    this.image = image;
  }

  protected override buildImage(width?: number): PdfImage {
    return width === undefined ? this.image : resizeDecodedImage(this.image, width);
  }
}
