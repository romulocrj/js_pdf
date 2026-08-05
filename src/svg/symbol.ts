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
 *   - pdf/lib/src/svg/symbol.dart
 */

import type { SvgBrush } from './brush.ts';
import { SvgClipPath } from './clip_path.ts';
import { SvgGroup } from './group.ts';
import type { SvgOperation } from './operation.ts';
import type { SvgPainter } from './painter.ts';
import { SvgTransform } from './transform.ts';
import type { XmlElement } from './xml.ts';

export class SvgSymbol extends SvgGroup {
  static override fromXml(element: XmlElement, painter: SvgPainter, parent: SvgBrush): SvgSymbol {
    const brush = painter.brushFor(element, parent);
    const children: SvgOperation[] = [];

    for (const child of element.elements) {
      const operation = painter.operationFromXml(child, brush);
      if (operation !== null) {
        children.push(operation);
      }
    }

    return new SvgSymbol(
      children,
      brush,
      SvgClipPath.fromXml(element, painter, brush),
      SvgTransform.fromXml(element),
      painter
    );
  }
}
