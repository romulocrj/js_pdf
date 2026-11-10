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
 *   - pdf/lib/src/svg/image.dart
 */

import type { PdfCanvas } from '../pdf/graphics.ts';
import { PdfImage } from '../pdf/obj/image.ts';
import type { PdfRect } from '../pdf/rect.ts';
import { SvgBrush } from './brush.ts';
import { SvgClipPath } from './clip_path.ts';
import { SvgOperation } from './operation.ts';
import type { SvgPainter } from './painter.ts';
import { getNumeric } from './parser.ts';
import { SvgTransform } from './transform.ts';
import type { XmlElement } from './xml.ts';

function base64Value(code: number): number {
  if (code >= 0x41 && code <= 0x5a) return code - 0x41;
  if (code >= 0x61 && code <= 0x7a) return code - 0x61 + 26;
  if (code >= 0x30 && code <= 0x39) return code - 0x30 + 52;
  if (code === 0x2b) return 62;
  if (code === 0x2f) return 63;
  return -1;
}

function decodeBase64(value: string): Uint8Array {
  let useful = 0;
  let padding = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code === 0x3d) padding++;
    else if (base64Value(code) >= 0) useful++;
    else if (code !== 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
      throw new SyntaxError('Invalid base64 character in SVG image');
    }
  }
  if ((useful + padding) % 4 !== 0 || padding > 2) {
    throw new SyntaxError('Invalid base64 length in SVG image');
  }
  const result = new Uint8Array(Math.floor(useful * 6 / 8));
  let accumulator = 0;
  let bits = 0;
  let output = 0;
  for (let index = 0; index < value.length; index++) {
    const digit = base64Value(value.charCodeAt(index));
    if (digit < 0) continue;
    accumulator = (accumulator << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      if (output < result.length) result[output++] = (accumulator >>> bits) & 0xff;
    }
  }
  return result;
}

export class SvgImageOperation extends SvgOperation {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly image: PdfImage;

  constructor(
    x: number,
    y: number,
    width: number,
    height: number,
    image: PdfImage,
    brush: SvgBrush,
    clip: SvgClipPath,
    transform: SvgTransform,
    painter: SvgPainter
  ) {
    super(brush, clip, transform, painter);
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.image = image;
  }

  /**
   * Null when the image cannot be used: an external href, a payload that is
   * not base64, or one that is not a decodable PNG or JPEG (a nested SVG, a
   * GIF, a WebP, a truncated file). That costs this element only; upstream and
   * the port used to abort the whole document.
   */
  static fromXml(element: XmlElement, painter: SvgPainter, parent: SvgBrush): SvgImageOperation | null {
    const brush = SvgBrush.fromXml(element, parent, painter.parser);
    const length = (name: string, axis: 'x' | 'y'): number => getNumeric(element, name, brush)?.lengthIn(axis) ?? 0;
    const href = element.getAttribute('href') ?? element.getAttribute(
      'href', 'http://www.w3.org/1999/xlink'
    );
    if (href === null || !href.startsWith('data:') || !href.includes(';base64,')) {
      return null;
    }
    let image: PdfImage;
    try {
      const bytes = decodeBase64(href.slice(href.indexOf(';base64,') + 8));
      image = bytes[0] === 0xff && bytes[1] === 0xd8
        ? PdfImage.fromJpeg(bytes)
        : PdfImage.fromPng(bytes);
    } catch {
      return null;
    }
    const width = length('width', 'x');
    const height = length('height', 'y');
    const x = length('x', 'x');
    const y = length('y', 'y');
    return new SvgImageOperation(
      x, y, width, height, image, brush,
      SvgClipPath.fromXml(element, painter, brush),
      SvgTransform.fromXml(element),
      painter
    );
  }

  protected paintShape(canvas: PdfCanvas): void {
    if (this.width <= 0 || this.height <= 0) return;
    canvas.saveContext();
    canvas.setTransform([1, 0, 0, -1, this.x, this.y + this.height]);
    canvas.drawImage(this.image, 0, 0, this.width, this.height);
    canvas.restoreContext();
  }

  protected drawShape(_canvas: PdfCanvas): void {}

  boundingBox(): PdfRect {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }
}
