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
 *   - pdf/lib/src/svg/clip_path.dart
 *
 * A referenced clip path becomes a PDF current path followed by `W n`.
 * Object-bounding-box units are implemented here even though upstream ignores
 * them: the roadmap promises them, and exported drawing tools emit them.
 */

import type { PdfCanvas } from '../pdf/graphics.ts';
import { multiplyMatrix, scaleMatrix, translationMatrix } from '../pdf/matrix.ts';
import type { PdfRect } from '../pdf/rect.ts';
import { SvgBrush } from './brush.ts';
import type { SvgOperation } from './operation.ts';
import type { SvgPainter } from './painter.ts';
import type { XmlElement } from './xml.ts';

export type SvgClipPathUnits = 'userSpaceOnUse' | 'objectBoundingBox';

export class SvgClipPath {
  readonly children: readonly SvgOperation[];
  readonly units: SvgClipPathUnits;
  readonly evenOdd: boolean;

  constructor(
    children: readonly SvgOperation[],
    units: SvgClipPathUnits = 'userSpaceOnUse',
    evenOdd = false
  ) {
    this.children = children;
    this.units = units;
    this.evenOdd = evenOdd;
  }

  static readonly empty = new SvgClipPath([]);

  get isEmpty(): boolean {
    return this.children.length === 0;
  }

  get isNotEmpty(): boolean {
    return !this.isEmpty;
  }

  static fromXml(element: XmlElement, painter: SvgPainter, parent: SvgBrush): SvgClipPath {
    const attribute = element.getAttribute('clip-path');
    if (attribute?.startsWith('url(#') !== true) {
      return SvgClipPath.empty;
    }

    const closing = attribute.lastIndexOf(')');
    if (closing < 5) {
      return SvgClipPath.empty;
    }

    const referenced = painter.parser.findById(attribute.slice(5, closing));
    if (referenced === null || referenced.name.local !== 'clipPath') {
      return SvgClipPath.empty;
    }

    const brush = SvgBrush.fromXml(referenced, parent, painter.parser);
    const children: SvgOperation[] = [];
    let evenOdd = referenced.getAttribute('clip-rule') === 'evenodd';

    for (const child of referenced.elements) {
      const operation = painter.operationFromXml(child, brush);
      if (operation !== null) {
        children.push(operation);
        evenOdd ||= child.getAttribute('clip-rule') === 'evenodd';
      }
    }

    const units = referenced.getAttribute('clipPathUnits') === 'objectBoundingBox'
      ? 'objectBoundingBox'
      : 'userSpaceOnUse';
    return new SvgClipPath(children, units, evenOdd);
  }

  apply(canvas: PdfCanvas, target: PdfRect): void {
    if (this.isEmpty) {
      return;
    }

    if (this.units === 'objectBoundingBox') {
      canvas.saveContext();
      canvas.setTransform(multiplyMatrix(
        translationMatrix(target.x, target.y),
        scaleMatrix(target.width, target.height)
      ));
    }

    for (const child of this.children) {
      child.draw(canvas);
    }

    if (this.units === 'objectBoundingBox') {
      canvas.restoreContext();
    }

    canvas.clipPath({ evenOdd: this.evenOdd });
  }
}
