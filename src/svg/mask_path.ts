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
 *   - pdf/lib/src/svg/mask_path.dart
 *   - pdf/lib/src/pdf/graphic_state.dart
 */

import { PdfCanvas } from '../pdf/graphics.ts';
import type { PdfRect } from '../pdf/rect.ts';
import { SvgGroup } from './group.ts';
import { SvgOperation } from './operation.ts';
import type { SvgPainter } from './painter.ts';
import type { XmlElement } from './xml.ts';

function referenceId(value: string): string | null {
  const match = /^url\(\s*#([^\s)]+)\s*\)$/.exec(value);
  return match?.[1] ?? null;
}

export class SvgMaskedOperation extends SvgOperation {
  readonly target: SvgOperation;
  readonly mask: SvgGroup;

  constructor(target: SvgOperation, mask: SvgGroup, painter: SvgPainter) {
    super(target.brush, target.clip, target.transform, painter);
    this.target = target;
    this.mask = mask;
  }

  static fromXml(
    element: XmlElement,
    target: SvgOperation,
    painter: SvgPainter
  ): SvgMaskedOperation {
    const attribute = element.getAttribute('mask');
    const id = attribute === null ? null : referenceId(attribute);
    const maskElement = id === null ? null : painter.parser.findById(id);
    if (maskElement === null || maskElement.name.local !== 'mask') {
      throw new RangeError(`Unable to resolve SVG mask ${attribute ?? ''}`.trim());
    }
    const mask = SvgGroup.fromXml(maskElement, painter, target.brush);
    return new SvgMaskedOperation(target, mask, painter);
  }

  override paint(canvas: PdfCanvas): void {
    const maskCanvas = new PdfCanvas(canvas.pageHeight);
    this.mask.paint(maskCanvas);
    canvas.saveContext();
    canvas.setSoftMask({
      content: maskCanvas.takeOutputBytes(),
      boundingBox: this.boundingBox(),
      fonts: maskCanvas.fonts,
      graphicStates: maskCanvas.graphicStates,
      patterns: maskCanvas.patterns,
      shadings: maskCanvas.shadings,
      images: maskCanvas.images
    });
    this.target.paint(canvas);
    canvas.restoreContext();
  }

  override draw(canvas: PdfCanvas): void {
    this.target.draw(canvas);
  }

  protected paintShape(_canvas: PdfCanvas): void {}
  protected drawShape(_canvas: PdfCanvas): void {}

  boundingBox(): PdfRect {
    return this.target.boundingBox();
  }
}
