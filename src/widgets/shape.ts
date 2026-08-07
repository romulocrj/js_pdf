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
 *   - pdf/lib/src/widgets/shape.dart
 *   - pdf/lib/src/widgets/svg.dart
 *
 * `Vector` is the imperative drawing surface for caller-defined graphics.
 * `SvgImage` uses the richer path API directly because SVG needs cubic paths,
 * transforms and clipping beyond this convenience surface.
 */

import { normalizeColor } from '../pdf/color.ts';
import type { ColorInput } from '../pdf/color.ts';
import type { PdfFont } from '../pdf/font/font.ts';
import type { PdfPoint } from '../pdf/rect.ts';
import { BoxConstraints } from './geometry.ts';
import { Widget } from './widget.ts';
import type { Constraints, LayoutBox, PositionedBox, RenderContext } from './widget.ts';

export interface VectorRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fill?: ColorInput | null;
  readonly stroke?: ColorInput | null;
  readonly lineWidth?: number;
}

export interface VectorLine {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly color?: ColorInput;
  readonly lineWidth?: number;
}

export interface VectorCircle {
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  readonly fill?: ColorInput | null;
  readonly stroke?: ColorInput | null;
  readonly lineWidth?: number;
}

export interface VectorText {
  readonly value: string;
  readonly x: number;
  readonly y: number;
  readonly fontSize?: number;
  readonly color?: ColorInput;

  /** Defaults to the document's font, matching `Text`. */
  readonly font?: PdfFont;
}

/** The drawing surface handed to `Vector`'s `draw` callback. */
export interface VectorApi {
  rect(options: VectorRect): void;
  line(options: VectorLine): void;
  circle(options: VectorCircle): void;
  text(options: VectorText): void;
}

export interface VectorOptions {
  readonly width: number;
  readonly height: number;
  readonly draw: (api: VectorApi) => void;
}

export interface VectorLayoutData {
  readonly scale: number;
}

export class Vector extends Widget<VectorLayoutData> {
  readonly width: number;
  readonly height: number;
  readonly draw: (api: VectorApi) => void;

  constructor({ width, height, draw }: VectorOptions) {
    super();
    this.width = Number(width);
    this.height = Number(height);
    this.draw = draw;
  }

  override layout(_context: RenderContext, constraints: Constraints): LayoutBox<VectorLayoutData> {
    const parent = BoxConstraints.from(constraints);
    const scale = Math.min(1, parent.maxWidth / this.width, parent.maxHeight / this.height);
    const size = parent.constrain({ width: this.width * scale, height: this.height * scale });
    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: { scale }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<VectorLayoutData>): void {
    const scale = box.data.scale;
    const api: VectorApi = {
      rect: ({ x, y, width, height, fill = null, stroke = null, lineWidth = 1 }) => {
        if (fill) context.canvas.fillRect(box.x + x * scale, box.y + y * scale, width * scale, height * scale, fill);
        if (stroke) context.canvas.strokeRect(box.x + x * scale, box.y + y * scale, width * scale, height * scale, stroke, lineWidth * scale);
      },
      line: ({ x1, y1, x2, y2, color = '#000000', lineWidth = 1 }) => {
        context.canvas.line(box.x + x1 * scale, box.y + y1 * scale, box.x + x2 * scale, box.y + y2 * scale, color, lineWidth * scale);
      },
      circle: ({ cx, cy, radius, fill = null, stroke = null, lineWidth = 1 }) => {
        context.canvas.circle(box.x + cx * scale, box.y + cy * scale, radius * scale, { fill, stroke, lineWidth: lineWidth * scale });
      },
      // Before phase 0.3 this passed no font, so the text was encoded with the
      // library default while the page's one `/Font` entry named whatever the
      // document had asked for — the two disagreed for any non-default font.
      text: ({ value, x, y, fontSize = 12, color = '#000000', font }) => {
        context.canvas.text(String(value), box.x + x * scale, box.y + y * scale, {
          fontSize: fontSize * scale,
          color: normalizeColor(color),
          font: font ?? context.document.font
        });
      }
    };

    this.draw(api);
  }
}

export interface PaintedShapeOptions {
  readonly fillColor?: ColorInput | null;
  readonly strokeColor?: ColorInput | null;
  readonly strokeWidth?: number;
}

function constrainedCanvas(constraints: Constraints): { readonly width: number; readonly height: number } {
  const parent = BoxConstraints.from(constraints);
  return {
    width: parent.hasBoundedWidth ? parent.maxWidth : parent.minWidth,
    height: parent.hasBoundedHeight ? parent.maxHeight : parent.minHeight
  };
}

function validatedStrokeWidth(value: number): number {
  const width = Number(value);
  if (!Number.isFinite(width) || width < 0) {
    throw new RangeError('strokeWidth must be a finite non-negative number');
  }
  return width;
}

function paintPath(
  context: RenderContext,
  fillColor: ColorInput | null,
  strokeColor: ColorInput | null,
  strokeWidth: number
): void {
  if (fillColor !== null) context.canvas.setFillColor(fillColor);
  if (strokeColor !== null) context.canvas.setStrokeColor(strokeColor);
  context.canvas.setLineWidth(strokeWidth);
  if (fillColor !== null && strokeColor !== null) context.canvas.fillAndStrokePath();
  else if (strokeColor !== null) context.canvas.strokePath();
  else context.canvas.fillPath();
}

abstract class PaintedShape extends Widget<null> {
  readonly fillColor: ColorInput | null;
  readonly strokeColor: ColorInput | null;
  readonly strokeWidth: number;

  constructor({ fillColor = null, strokeColor = null, strokeWidth = 1 }: PaintedShapeOptions = {}) {
    super();
    this.fillColor = fillColor;
    this.strokeColor = strokeColor;
    this.strokeWidth = validatedStrokeWidth(strokeWidth);
  }

  override layout(_context: RenderContext, constraints: Constraints): LayoutBox<null> {
    const size = constrainedCanvas(constraints);
    return { widget: this, width: size.width, height: size.height, data: null };
  }
}

/** An ellipse that fills the widget's box. */
export class Circle extends PaintedShape {
  override paint(context: RenderContext, box: PositionedBox<null>): void {
    context.canvas.saveContext();
    context.canvas.drawEllipse(
      box.x + box.width / 2,
      context.canvas.toPdfY(box.y + box.height / 2),
      box.width / 2,
      box.height / 2
    );
    paintPath(context, this.fillColor, this.strokeColor, this.strokeWidth);
    context.canvas.restoreContext();
  }
}

/** A rectangle that fills the widget's box. */
export class Rectangle extends PaintedShape {
  override paint(context: RenderContext, box: PositionedBox<null>): void {
    context.canvas.saveContext();
    context.canvas.drawRect(box.x, context.canvas.toPdfY(box.y + box.height), box.width, box.height);
    paintPath(context, this.fillColor, this.strokeColor, this.strokeWidth);
    context.canvas.restoreContext();
  }
}

export interface PolygonOptions extends PaintedShapeOptions {
  readonly points: readonly PdfPoint[];
  readonly close?: boolean;
}

/** A polygon whose points use widget-local, top-left coordinates. */
export class Polygon extends PaintedShape {
  readonly points: readonly PdfPoint[];
  readonly close: boolean;

  constructor({ points, close = true, ...options }: PolygonOptions) {
    super(options);
    this.points = points;
    this.close = Boolean(close);
  }

  override paint(context: RenderContext, box: PositionedBox<null>): void {
    if (this.points.length < (this.close ? 3 : 2)) return;
    context.canvas.saveContext();
    const first = this.points[0]!;
    context.canvas.moveTo(box.x + first.x, context.canvas.toPdfY(box.y + first.y));
    for (let index = 1; index < this.points.length; index++) {
      const point = this.points[index]!;
      context.canvas.lineTo(box.x + point.x, context.canvas.toPdfY(box.y + point.y));
    }
    if (this.close) context.canvas.closePath();
    paintPath(context, this.fillColor, this.strokeColor, this.strokeWidth);
    context.canvas.restoreContext();
  }
}

export interface InkListOptions {
  readonly points: readonly (readonly PdfPoint[])[];
  readonly strokeColor?: ColorInput | null;
  readonly strokeWidth?: number;
}

/** One or more freehand strokes in widget-local, top-left coordinates. */
export class InkList extends Widget<null> {
  readonly points: readonly (readonly PdfPoint[])[];
  readonly strokeColor: ColorInput | null;
  readonly strokeWidth: number;

  constructor({ points, strokeColor = null, strokeWidth = 1 }: InkListOptions) {
    super();
    this.points = points;
    this.strokeColor = strokeColor;
    this.strokeWidth = validatedStrokeWidth(strokeWidth);
  }

  override layout(_context: RenderContext, constraints: Constraints): LayoutBox<null> {
    const size = constrainedCanvas(constraints);
    return { widget: this, width: size.width, height: size.height, data: null };
  }

  override paint(context: RenderContext, box: PositionedBox<null>): void {
    context.canvas.saveContext();
    if (this.strokeColor !== null) context.canvas.setStrokeColor(this.strokeColor);
    context.canvas.setLineWidth(this.strokeWidth);
    for (const line of this.points) {
      const first = line[0];
      if (first === undefined) continue;
      context.canvas.moveTo(box.x + first.x, context.canvas.toPdfY(box.y + first.y));
      for (const point of line) {
        context.canvas.lineTo(box.x + point.x, context.canvas.toPdfY(box.y + point.y));
      }
    }
    context.canvas.strokePath();
    context.canvas.restoreContext();
  }
}
