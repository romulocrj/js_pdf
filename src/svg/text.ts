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
 *   - pdf/lib/src/svg/text.dart
 */

import { PdfGraphicState } from '../pdf/graphic_state.ts';
import type { PdfFont } from '../pdf/font/font.ts';
import type { PdfFontMetrics } from '../pdf/font/font_metrics.ts';
import type { PdfCanvas } from '../pdf/graphics.ts';
import type { PdfRect } from '../pdf/rect.ts';
import { SvgBrush } from './brush.ts';
import { SvgClipPath } from './clip_path.ts';
import { SvgOperation } from './operation.ts';
import type { SvgPainter } from './painter.ts';
import { getNumeric } from './parser.ts';
import { SvgTransform } from './transform.ts';
import { XmlText } from './xml.ts';
import type { XmlElement } from './xml.ts';

interface TextOffset {
  readonly x: number;
  readonly y: number;
}

export class SvgText extends SvgOperation {
  readonly x: number;
  readonly y: number;
  readonly advance: number;
  readonly text: string;
  readonly font: PdfFont;
  readonly fontSize: number;
  readonly metrics: PdfFontMetrics;
  readonly spans: readonly SvgText[];

  constructor(
    x: number,
    y: number,
    advance: number,
    text: string,
    font: PdfFont,
    fontSize: number,
    metrics: PdfFontMetrics,
    spans: readonly SvgText[],
    brush: SvgBrush,
    clip: SvgClipPath,
    transform: SvgTransform,
    painter: SvgPainter
  ) {
    super(brush, clip, transform, painter);
    this.x = x;
    this.y = y;
    this.advance = advance;
    this.text = text;
    this.font = font;
    this.fontSize = fontSize;
    this.metrics = metrics;
    this.spans = spans;
  }

  static fromXml(
    element: XmlElement,
    painter: SvgPainter,
    parent: SvgBrush,
    offset: TextOffset = { x: 0, y: 0 }
  ): SvgText {
    const brush = SvgBrush.fromXml(element, parent, painter.parser);
    const dx = getNumeric(element, 'dx', brush, { defaultValue: 0 })!.sizeValue;
    const dy = getNumeric(element, 'dy', brush, { defaultValue: 0 })!.sizeValue;
    const ownX = getNumeric(element, 'x', brush)?.sizeValue;
    const ownY = getNumeric(element, 'y', brush)?.sizeValue;
    const text = element.children
      .filter((child): child is XmlText => child instanceof XmlText)
      .map(child => child.value)
      .join('')
      .trim();
    const fontSize = brush.fontSize!.sizeValue;
    const font = painter.resolveFont(
      brush.fontFamily!, brush.fontStyle!, brush.fontWeight!
    );
    const metrics = font.stringMetrics(text, fontSize);
    let x = (ownX ?? offset.x) + dx;
    const y = (ownY ?? offset.y) + dy;
    if (brush.textAnchor === 'middle') x -= metrics.width / 2;
    else if (brush.textAnchor === 'end') x -= metrics.width;

    let childOffset = { x: x + metrics.advanceWidth, y };
    const spans: SvgText[] = [];
    for (const child of element.elements) {
      if (child.name.local !== 'tspan') continue;
      const span = SvgText.fromXml(child, painter, brush, childOffset);
      spans.push(span);
      childOffset = { x: span.x + span.advance, y: span.y };
    }
    return new SvgText(
      x, y, metrics.advanceWidth, text, font, fontSize, metrics, spans,
      brush,
      SvgClipPath.fromXml(element, painter, brush),
      SvgTransform.fromXml(element),
      painter
    );
  }

  protected paintShape(canvas: PdfCanvas): void {
    const fill = this.brush.fill!;
    const stroke = this.brush.stroke!;
    if (this.text.length > 0 && fill.isNotEmpty) {
      canvas.saveContext();
      fill.setFillColor(this, canvas);
      if (this.brush.fillOpacity! < 1) {
        canvas.setGraphicState(new PdfGraphicState({ opacity: this.brush.fillOpacity }));
      }
      canvas.drawString(this.font, this.fontSize, this.text, this.x, this.y, 0);
      canvas.restoreContext();
    }
    if (this.text.length > 0 && stroke.isNotEmpty) {
      canvas.saveContext();
      stroke.setStrokeColor(this, canvas);
      if (this.brush.strokeWidth !== null) canvas.setLineWidth(this.brush.strokeWidth.sizeValue);
      if (this.brush.strokeDashArray !== null) canvas.setLineDashPattern(this.brush.strokeDashArray);
      if (this.brush.strokeOpacity! < 1) {
        canvas.setGraphicState(new PdfGraphicState({ opacity: this.brush.strokeOpacity }));
      }
      canvas.drawString(this.font, this.fontSize, this.text, this.x, this.y, 1);
      canvas.restoreContext();
    }
    for (const span of this.spans) span.paint(canvas);
  }

  protected drawShape(canvas: PdfCanvas): void {
    if (this.text.length > 0) {
      canvas.drawString(this.font, this.fontSize, this.text, this.x, this.y, 7);
    }
    for (const span of this.spans) span.draw(canvas);
  }

  boundingBox(): PdfRect {
    let left = this.x + this.metrics.left;
    let bottom = this.y - this.metrics.bottom;
    let right = this.x + this.metrics.right;
    let top = this.y - this.metrics.top;
    for (const span of this.spans) {
      const box = span.boundingBox();
      left = Math.min(left, box.x);
      bottom = Math.min(bottom, box.y);
      right = Math.max(right, box.x + box.width);
      top = Math.max(top, box.y + box.height);
    }
    return { x: left, y: bottom, width: right - left, height: top - bottom };
  }
}
