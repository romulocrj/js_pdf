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
 *   - pdf/lib/src/widgets/image_provider.dart
 *
 * Image bytes always come from the caller. Providers resolve synchronously to
 * document-independent `PdfImage` descriptions, so one provider can be reused
 * across documents without retaining a registry from a previous save.
 */

import { PdfImage } from '../pdf/obj/image.ts';
import type { PdfImageOrientation } from '../pdf/obj/image.ts';
import type { PdfPoint } from '../pdf/rect.ts';

export abstract class ImageProvider {
  readonly dpi: number | null;
  readonly orientation: PdfImageOrientation;
  private readonly sourceWidth: number;
  private readonly sourceHeight: number;
  private cached: PdfImage | null = null;

  protected constructor(
    width: number,
    height: number,
    orientation: PdfImageOrientation,
    dpi: number | null
  ) {
    this.sourceWidth = width;
    this.sourceHeight = height;
    this.orientation = orientation;
    this.dpi = dpi;
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

  protected abstract buildImage(): PdfImage;

  resolve(_size?: PdfPoint, _dpi?: number | null): PdfImage {
    this.cached ??= this.buildImage();
    return this.cached;
  }
}

export class ImageProxy extends ImageProvider {
  private readonly image: PdfImage;

  constructor(image: PdfImage, { dpi = null }: { readonly dpi?: number | null } = {}) {
    super(image.sourceWidth, image.sourceHeight, image.orientation, dpi);
    this.image = image;
  }

  protected override buildImage(): PdfImage {
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
  }

  protected override buildImage(): PdfImage {
    return this.image;
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

  protected override buildImage(): PdfImage {
    return this.image;
  }
}
