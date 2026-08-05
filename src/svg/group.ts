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
 *   - pdf/lib/src/svg/group.dart
 */

import type { PdfCanvas } from '../pdf/graphics.ts';
import { PdfRect } from '../pdf/rect.ts';
import { SvgBrush } from './brush.ts';
import { SvgClipPath } from './clip_path.ts';
import { SvgOperation } from './operation.ts';
import type { SvgPainter } from './painter.ts';
import { SvgTransform } from './transform.ts';
import type { XmlElement } from './xml.ts';

export class SvgGroup extends SvgOperation {
  readonly children: readonly SvgOperation[];

  constructor(
    children: readonly SvgOperation[],
    brush: SvgBrush,
    clip: SvgClipPath,
    transform: SvgTransform,
    painter: SvgPainter
  ) {
    super(brush, clip, transform, painter);
    this.children = children;
  }

  static fromXml(element: XmlElement, painter: SvgPainter, parent: SvgBrush): SvgGroup {
    const brush = SvgBrush.fromXml(element, parent, painter.parser);
    const children: SvgOperation[] = [];

    for (const child of element.elements) {
      if (child.name.local === 'symbol') {
        continue;
      }
      const operation = painter.operationFromXml(child, brush);
      if (operation !== null) {
        children.push(operation);
      }
    }

    return new SvgGroup(
      children,
      brush,
      SvgClipPath.fromXml(element, painter, brush),
      SvgTransform.fromXml(element),
      painter
    );
  }

  protected paintShape(canvas: PdfCanvas): void {
    for (const child of this.children) {
      child.paint(canvas);
    }
  }

  protected drawShape(canvas: PdfCanvas): void {
    for (const child of this.children) {
      child.draw(canvas);
    }
  }

  boundingBox(): PdfRect {
    if (this.children.length === 0) {
      return PdfRect.zero;
    }

    let left = Infinity;
    let bottom = Infinity;
    let right = -Infinity;
    let top = -Infinity;

    for (const child of this.children) {
      const box = child.boundingBox();
      left = Math.min(left, PdfRect.left(box));
      bottom = Math.min(bottom, PdfRect.bottom(box));
      right = Math.max(right, PdfRect.right(box));
      top = Math.max(top, PdfRect.top(box));
    }

    return PdfRect.fromLTRB(left, bottom, right, top);
  }
}
