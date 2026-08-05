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
 *   - pdf/lib/src/svg/use.dart
 */

import type { PdfCanvas } from '../pdf/graphics.ts';
import { translationMatrix } from '../pdf/matrix.ts';
import { PdfRect } from '../pdf/rect.ts';
import { SvgBrush } from './brush.ts';
import { SvgOperation } from './operation.ts';
import type { SvgPainter } from './painter.ts';
import { getNumeric } from './parser.ts';
import { SvgTransform } from './transform.ts';
import type { XmlElement } from './xml.ts';

const XLINK = 'http://www.w3.org/1999/xlink';

export class SvgUse extends SvgOperation {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly href: SvgOperation | null;

  constructor(
    x: number,
    y: number,
    width: number,
    height: number,
    href: SvgOperation | null,
    brush: SvgBrush,
    transform: SvgTransform,
    painter: SvgPainter
  ) {
    super(brush, transform, painter);
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.href = href;
  }

  static fromXml(element: XmlElement, painter: SvgPainter, parent: SvgBrush): SvgUse {
    const brush = SvgBrush.fromXml(element, parent, painter.parser);
    const x = getNumeric(element, 'x', brush, { defaultValue: 0 })!.sizeValue;
    const y = getNumeric(element, 'y', brush, { defaultValue: 0 })!.sizeValue;
    const width = getNumeric(element, 'width', brush, { defaultValue: 0 })!.sizeValue;
    const height = getNumeric(element, 'height', brush, { defaultValue: 0 })!.sizeValue;
    const hrefAttribute = element.getAttribute('href') ?? element.getAttribute('href', XLINK);

    let href: SvgOperation | null = null;
    if (hrefAttribute?.startsWith('#') === true) {
      const referenced = painter.parser.findById(hrefAttribute.slice(1));
      if (referenced !== null && referenced !== element) {
        href = painter.operationFromXml(referenced, brush);
      }
    }

    return new SvgUse(
      x,
      y,
      width,
      height,
      href,
      brush,
      SvgTransform.fromXml(element),
      painter
    );
  }

  protected paintShape(canvas: PdfCanvas): void {
    if (this.x !== 0 || this.y !== 0) {
      canvas.setTransform(translationMatrix(this.x, this.y));
    }
    this.href?.paint(canvas);
  }

  protected drawShape(canvas: PdfCanvas): void {
    if (this.x !== 0 || this.y !== 0) {
      canvas.setTransform(translationMatrix(this.x, this.y));
    }
    this.href?.draw(canvas);
  }

  boundingBox(): PdfRect {
    return this.href?.boundingBox() ?? PdfRect.zero;
  }
}
