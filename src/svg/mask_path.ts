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
 *
 * A `mask` reference, painted into a luminosity soft mask by
 * `SvgOperation.paint` after the element's own transform, so the mask content
 * shares the element's user space. The /BBox is the painter's page box mapped
 * into that space (upstream PR #1980's `userSpaceBoundingBox`), so neither a
 * transform nor a stroke beyond the geometry is cut. An unresolvable
 * reference is ignored, as an unresolvable clip-path already was; it used to
 * throw out of the document.
 */

import { PdfCanvas } from '../pdf/graphics.ts';
import { SvgGroup } from './group.ts';
import type { SvgPainter } from './painter.ts';
import type { XmlElement } from './xml.ts';

export class SvgMask {
  readonly content: SvgGroup;
  readonly painter: SvgPainter;

  constructor(content: SvgGroup, painter: SvgPainter) {
    this.content = content;
    this.painter = painter;
  }

  /** The mask `element` names, or null when it names none that resolves. */
  static fromXml(element: XmlElement, painter: SvgPainter): SvgMask | null {
    const id = /^url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/.exec(element.getAttribute('mask') ?? '')?.[2];
    const mask = id === undefined ? null : painter.parser.findById(id);
    if (mask?.name.local !== 'mask') {
      return null;
    }
    // Mask content inherits from the <mask>'s own ancestors, not from the
    // element it masks, as CSS inheritance follows the document tree.
    return new SvgMask(SvgGroup.fromXml(mask, painter, painter.brushOf(mask.parent)), painter);
  }

  apply(canvas: PdfCanvas): void {
    const maskCanvas = new PdfCanvas(canvas.pageHeight);
    this.content.paint(maskCanvas);
    canvas.setSoftMask({
      content: maskCanvas.takeOutputBytes(),
      boundingBox: this.painter.userSpaceBox(canvas),
      fonts: maskCanvas.fonts,
      graphicStates: maskCanvas.graphicStates,
      patterns: maskCanvas.patterns,
      shadings: maskCanvas.shadings,
      images: maskCanvas.images
    });
  }
}
