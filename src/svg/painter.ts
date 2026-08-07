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
 *   - pdf/lib/src/svg/painter.dart
 *   - pdf/lib/src/svg/operation.dart
 */

import type { PdfCanvas } from '../pdf/graphics.ts';
import type { PdfFont } from '../pdf/font/font.ts';
import { PdfType1Font } from '../pdf/font/type1_fonts.ts';
import type { PdfRect } from '../pdf/rect.ts';
import { SvgBrush } from './brush.ts';
import { SvgGroup } from './group.ts';
import { SvgImageOperation } from './image.ts';
import { SvgMaskedOperation } from './mask_path.ts';
import type { SvgOperation } from './operation.ts';
import type { SvgParser } from './parser.ts';
import { SvgPath } from './path.ts';
import { SvgSymbol } from './symbol.ts';
import { SvgText } from './text.ts';
import { SvgUse } from './use.ts';
import type { XmlElement } from './xml.ts';

export class SvgPainter {
  readonly parser: SvgParser;
  readonly canvas: PdfCanvas;
  readonly boundingBox: PdfRect;
  private readonly fontLookup: (family: string, style: string, weight: string) => PdfFont;
  private readonly fonts = new Map<string, PdfFont>();

  constructor(
    parser: SvgParser,
    canvas: PdfCanvas,
    boundingBox: PdfRect,
    fontLookup: (family: string, style: string, weight: string) => PdfFont = () => PdfType1Font.helvetica()
  ) {
    this.parser = parser;
    this.canvas = canvas;
    this.boundingBox = boundingBox;
    this.fontLookup = fontLookup;
  }

  resolveFont(family: string, style: string, weight: string): PdfFont {
    const key = `${family}-${style}-${weight}`;
    let font = this.fonts.get(key);
    if (font === undefined) {
      font = this.fontLookup(family, style, weight);
      this.fonts.set(key, font);
    }
    return font;
  }

  brushFor(element: XmlElement, parent: SvgBrush): SvgBrush {
    return SvgBrush.fromXml(element, parent, this.parser);
  }

  operationFromXml(element: XmlElement, brush: SvgBrush): SvgOperation | null {
    if (element.getAttribute('visibility') === 'hidden' || element.getAttribute('display') === 'none') {
      return null;
    }
    let operation: SvgOperation | null;
    switch (element.name.local) {
      case 'circle':
      case 'ellipse':
      case 'line':
      case 'path':
      case 'polygon':
      case 'polyline':
      case 'rect':
        operation = SvgPath.fromXmlElement(element, this, brush);
        break;
      case 'g':
      case 'svg':
        operation = SvgGroup.fromXml(element, this, brush);
        break;
      case 'symbol':
        operation = SvgSymbol.fromXml(element, this, brush);
        break;
      case 'use':
        operation = SvgUse.fromXml(element, this, brush);
        break;
      case 'text':
      case 'tspan':
        operation = SvgText.fromXml(element, this, brush);
        break;
      case 'image':
        operation = SvgImageOperation.fromXml(element, this, brush);
        break;
      default:
        operation = null;
    }
    return operation !== null && element.getAttribute('mask') !== null
      ? SvgMaskedOperation.fromXml(element, operation, this)
      : operation;
  }

  rootOperation(): SvgGroup {
    return SvgGroup.fromXml(this.parser.root, this, SvgBrush.defaultContext);
  }

  paint(): void {
    this.rootOperation().paint(this.canvas);
  }
}
