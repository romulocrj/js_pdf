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
 *
 * Operations are built eagerly, so the set of elements under construction is
 * painter state: an element met again while it is being built is a cycle — a
 * `<use>` of an ancestor, mutual references, a clip or mask that references
 * itself — and is skipped instead of overflowing the stack. Upstream PR #1980
 * threads an equivalent `expanding` id set through every builder.
 */

import type { PdfCanvas } from '../pdf/graphics.ts';
import type { PdfFont } from '../pdf/font/font.ts';
import { PdfType1Font } from '../pdf/font/type1_fonts.ts';
import { invertMatrix, transformPoint } from '../pdf/matrix.ts';
import { PdfRect } from '../pdf/rect.ts';
import { SvgBrush } from './brush.ts';
import { SvgClipPath } from './clip_path.ts';
import { SvgGroup } from './group.ts';
import type { SvgViewportSize } from './group.ts';
import { SvgImageOperation } from './image.ts';
import { SvgMask } from './mask_path.ts';
import type { SvgOperation } from './operation.ts';
import { convertStyle } from './parser.ts';
import type { SvgParser } from './parser.ts';
import { SvgPath } from './path.ts';
import { SvgText } from './text.ts';
import { SvgTransform } from './transform.ts';
import { SvgUse } from './use.ts';
import type { XmlElement } from './xml.ts';

export class SvgPainter {
  readonly parser: SvgParser;
  readonly canvas: PdfCanvas;
  readonly boundingBox: PdfRect;
  /** The brush above the root: defaults, with the root viewBox as the viewport. */
  readonly rootBrush: SvgBrush;
  private readonly fontLookup: (family: string, style: string, weight: string) => PdfFont;
  private readonly fonts = new Map<string, PdfFont>();
  private readonly building = new Set<XmlElement>();

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
    this.rootBrush = SvgBrush.defaultContext.copyWith({ viewport: parser.viewBox });
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

  /** The brush in force at `element` through its document ancestors. */
  brushOf(element: XmlElement | null): SvgBrush {
    return element === null
      ? this.rootBrush
      : SvgBrush.fromXml(element, this.brushOf(element.parent), this.parser);
  }

  /**
   * `boundingBox` (page space) mapped back into the canvas's current user
   * space: a soft mask's form is evaluated there, so this /BBox covers all
   * that can be visible without cutting a stroke that leaves the geometry.
   */
  userSpaceBox(canvas: PdfCanvas): PdfRect {
    const inverse = invertMatrix(canvas.getTransform());
    if (inverse === null) return this.boundingBox;
    const { x, y, width, height } = this.boundingBox;
    const corners = [[x, y], [x + width, y], [x, y + height], [x + width, y + height]]
      .map(([px, py]) => transformPoint(inverse, px!, py!));
    const xs = corners.map(point => point.x);
    const ys = corners.map(point => point.y);
    return PdfRect.fromLTRB(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
  }

  /**
   * `display` and `visibility` read after `style` is flattened: drawing tools
   * export hidden layers as `style="display:none"`, which upstream painted
   * because it tested the raw attributes before `convertStyle` ran.
   */
  private isHidden(element: XmlElement): boolean {
    convertStyle(element);
    return element.getAttribute('display')?.trim() === 'none'
      || element.getAttribute('visibility')?.trim() === 'hidden';
  }

  /** `size` comes from a `<use>` instancing a `<symbol>` or an `<svg>`. */
  operationFromXml(element: XmlElement, brush: SvgBrush, size: SvgViewportSize | null = null): SvgOperation | null {
    if (this.isHidden(element) || this.building.has(element)) {
      return null;
    }
    this.building.add(element);
    try {
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
          operation = SvgGroup.fromXml(element, this, brush);
          break;
        case 'svg':
          // A nested <svg> establishes a viewport; the root never comes here.
          operation = SvgGroup.fromXml(element, this, brush, size ?? {});
          break;
        case 'symbol':
          // Never rendered directly, only instanced by <use>.
          operation = size === null ? null : SvgGroup.fromXml(element, this, brush, size);
          break;
        case 'use':
          operation = SvgUse.fromXml(element, this, brush);
          break;
        case 'text':
          operation = SvgText.fromXml(element, this, brush);
          break;
        case 'image':
          operation = SvgImageOperation.fromXml(element, this, brush);
          break;
        default:
          operation = null;
      }
      if (operation !== null) {
        operation.mask = SvgMask.fromXml(element, this);
      }
      return operation;
    } finally {
      this.building.delete(element);
    }
  }

  rootOperation(): SvgGroup {
    const root = this.parser.root;
    // The root never passes through operationFromXml, so upstream never tested
    // its own display and visibility.
    if (this.isHidden(root)) {
      return new SvgGroup([], this.rootBrush, SvgClipPath.empty, SvgTransform.none, this);
    }
    this.building.add(root);
    try {
      return SvgGroup.fromXml(root, this, this.rootBrush);
    } finally {
      this.building.delete(root);
    }
  }

  paint(): void {
    this.rootOperation().paint(this.canvas);
  }
}
