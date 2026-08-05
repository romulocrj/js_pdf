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
 *   - pdf/lib/src/svg/painter.dart
 *   - pdf/lib/src/svg/operation.dart
 */

import type { PdfCanvas } from '../pdf/graphics.ts';
import type { PdfRect } from '../pdf/rect.ts';
import { SvgBrush } from './brush.ts';
import { SvgGroup } from './group.ts';
import type { SvgOperation } from './operation.ts';
import type { SvgParser } from './parser.ts';
import { SvgPath } from './path.ts';
import { SvgSymbol } from './symbol.ts';
import { SvgUse } from './use.ts';
import type { XmlElement } from './xml.ts';

export class SvgPainter {
  readonly parser: SvgParser;
  readonly canvas: PdfCanvas;
  readonly boundingBox: PdfRect;

  constructor(parser: SvgParser, canvas: PdfCanvas, boundingBox: PdfRect) {
    this.parser = parser;
    this.canvas = canvas;
    this.boundingBox = boundingBox;
  }

  brushFor(element: XmlElement, parent: SvgBrush): SvgBrush {
    return SvgBrush.fromXml(element, parent, this.parser);
  }

  operationFromXml(element: XmlElement, brush: SvgBrush): SvgOperation | null {
    if (element.getAttribute('visibility') === 'hidden' || element.getAttribute('display') === 'none') {
      return null;
    }

    switch (element.name.local) {
      case 'circle':
      case 'ellipse':
      case 'line':
      case 'path':
      case 'polygon':
      case 'polyline':
      case 'rect':
        return SvgPath.fromXmlElement(element, this, brush);
      case 'g':
      case 'svg':
        return SvgGroup.fromXml(element, this, brush);
      case 'symbol':
        return SvgSymbol.fromXml(element, this, brush);
      case 'use':
        return SvgUse.fromXml(element, this, brush);
      default:
        return null;
    }
  }

  rootOperation(): SvgGroup {
    return SvgGroup.fromXml(this.parser.root, this, SvgBrush.defaultContext);
  }

  paint(): void {
    this.rootOperation().paint(this.canvas);
  }
}
