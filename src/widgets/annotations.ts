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
 *   - pdf/lib/src/widgets/annotations.dart
 *
 * Annotation rectangles are registered during paint and carried with the
 * serialized page; widgets never retain page or layout state.
 */

import { normalizeColor } from '../pdf/color.ts';
import type { ColorInput, Rgb } from '../pdf/color.ts';
import type { PdfGeometricAnnotationKind } from '../pdf/obj/annotation.ts';
import type { PdfPoint } from '../pdf/rect.ts';
import type { PdfOutlineStyle } from '../pdf/obj/outline.ts';
import { BoxConstraints } from './geometry.ts';
import { Circle, InkList, Polygon, Rectangle } from './shape.ts';
import { Widget } from './widget.ts';
import type {
  AnyLayoutBox,
  AnyWidget,
  Constraints,
  LayoutBox,
  PositionedBox,
  RenderContext
} from './widget.ts';

export interface AnnotationRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export abstract class AnnotationBuilder {
  abstract build(context: RenderContext, rect: AnnotationRect): void;
}

export class AnnotationLink extends AnnotationBuilder {
  readonly destination: string;

  constructor(destination: string) {
    super();
    this.destination = String(destination);
    if (this.destination.length === 0) throw new RangeError('Annotation destination cannot be empty');
  }

  override build(context: RenderContext, rect: AnnotationRect): void {
    context.canvas.addNamedLink(this.destination, rect.x, rect.y, rect.width, rect.height);
  }
}

export class AnnotationUrl extends AnnotationBuilder {
  readonly destination: string;

  constructor(destination: string) {
    super();
    this.destination = String(destination);
    if (this.destination.length === 0) throw new RangeError('Annotation URL cannot be empty');
  }

  override build(context: RenderContext, rect: AnnotationRect): void {
    context.canvas.addUrlLink(this.destination, rect.x, rect.y, rect.width, rect.height);
  }
}

export interface AnnotationOptions {
  readonly child?: AnyWidget | null;
  readonly builder?: AnnotationBuilder | null;
}

export interface AnnotationLayoutData {
  readonly childBox: AnyLayoutBox | null;
}

export class Annotation extends Widget<AnnotationLayoutData> {
  readonly child: AnyWidget | null;
  readonly builder: AnnotationBuilder | null;

  constructor({ child = null, builder = null }: AnnotationOptions = {}) {
    super();
    this.child = child;
    this.builder = builder;
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<AnnotationLayoutData> {
    const parent = BoxConstraints.from(constraints);
    const childBox = this.child?.layout(context, parent) ?? null;
    const size = parent.constrain(childBox ?? { width: 0, height: 0 });
    return { widget: this, width: size.width, height: size.height, data: { childBox } };
  }

  override paint(context: RenderContext, box: PositionedBox<AnnotationLayoutData>): void {
    const { childBox } = box.data;
    childBox?.widget.paint(context, { ...childBox, x: box.x, y: box.y });
    if (box.width > 0 && box.height > 0) {
      this.builder?.build(context, box);
    }
  }
}

export interface LinkOptions {
  readonly child: AnyWidget;
  readonly destination: string;
}

export class Link extends Annotation {
  constructor({ child, destination }: LinkOptions) {
    super({ child, builder: new AnnotationLink(destination) });
  }
}

export class UrlLink extends Annotation {
  constructor({ child, destination }: LinkOptions) {
    super({ child, builder: new AnnotationUrl(destination) });
  }
}

export interface AnchorOptions {
  readonly child?: AnyWidget | null;
  readonly name: string;
  readonly zoom?: number | null;
  readonly setX?: boolean;
}

export class Anchor extends Widget<AnnotationLayoutData> {
  readonly child: AnyWidget | null;
  readonly name: string;
  readonly zoom: number | null;
  readonly setX: boolean;

  constructor({ child = null, name, zoom = null, setX = false }: AnchorOptions) {
    super();
    this.child = child;
    this.name = String(name);
    this.zoom = zoom;
    this.setX = setX;
    if (this.name.length === 0) throw new RangeError('Anchor name cannot be empty');
    if (zoom !== null && !Number.isFinite(zoom)) throw new RangeError('Anchor zoom must be finite');
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<AnnotationLayoutData> {
    const parent = BoxConstraints.from(constraints);
    const childBox = this.child?.layout(context, parent) ?? null;
    const size = parent.constrain(childBox ?? { width: 0, height: 0 });
    return { widget: this, width: size.width, height: size.height, data: { childBox } };
  }

  override paint(context: RenderContext, box: PositionedBox<AnnotationLayoutData>): void {
    const { childBox } = box.data;
    childBox?.widget.paint(context, { ...childBox, x: box.x, y: box.y });
    const point = context.canvas.transformWidgetPoint(box.x, box.y);
    context.document.registerDestination({
      name: this.name,
      pageNumber: context.pageNumber,
      x: this.setX ? point.x : null,
      y: point.y,
      zoom: this.zoom
    });
  }
}

export interface PdfBorder {
  readonly width?: number;
}

export interface GeometricAnnotationOptions {
  readonly color?: ColorInput | null;
  readonly interiorColor?: ColorInput | null;
  readonly border?: PdfBorder | null;
  readonly author?: string | null;
  readonly date?: Date | null;
  readonly subject?: string | null;
  readonly content?: string | null;
}

abstract class GeometricAnnotationBuilder extends AnnotationBuilder {
  readonly shape: PdfGeometricAnnotationKind;
  readonly color: Rgb | null;
  readonly interiorColor: Rgb | null;
  readonly borderWidth: number;
  readonly author: string | null;
  readonly date: Date | null;
  readonly subject: string | null;
  readonly content: string | null;

  constructor(shape: PdfGeometricAnnotationKind, {
    color = null,
    interiorColor = null,
    border = null,
    author = null,
    date = null,
    subject = null,
    content = null
  }: GeometricAnnotationOptions = {}) {
    super();
    this.shape = shape;
    this.color = color === null ? null : normalizeColor(color);
    this.interiorColor = interiorColor === null ? null : normalizeColor(interiorColor);
    this.borderWidth = Number(border?.width ?? 1);
    this.author = author;
    this.date = date;
    this.subject = subject;
    this.content = content;
  }

  protected base(context: RenderContext, rect: AnnotationRect): {
    readonly rect: AnnotationRect;
    readonly color: Rgb | null;
    readonly interiorColor: Rgb | null;
    readonly borderWidth: number;
    readonly author: string | null;
    readonly subject: string | null;
    readonly content: string | null;
    readonly date: string | null;
  } {
    const corners = [
      context.canvas.transformWidgetPoint(rect.x, rect.y),
      context.canvas.transformWidgetPoint(rect.x + rect.width, rect.y),
      context.canvas.transformWidgetPoint(rect.x, rect.y + rect.height),
      context.canvas.transformWidgetPoint(rect.x + rect.width, rect.y + rect.height)
    ];
    const xs = corners.map(point => point.x);
    const ys = corners.map(point => point.y);
    const minimumX = Math.min(...xs);
    const minimumY = Math.min(...ys);
    return {
      rect: {
        x: minimumX,
        y: minimumY,
        width: Math.max(...xs) - minimumX,
        height: Math.max(...ys) - minimumY
      },
      color: this.color,
      interiorColor: this.interiorColor,
      borderWidth: this.borderWidth,
      author: this.author,
      subject: this.subject,
      content: this.content,
      date: this.date === null
        ? null
        : `D:${this.date.toISOString().replace(/[-:T]/gu, '').slice(0, 14)}Z`
    };
  }
}

export class AnnotationSquare extends GeometricAnnotationBuilder {
  constructor(options: GeometricAnnotationOptions = {}) { super('square', options); }
  override build(context: RenderContext, rect: AnnotationRect): void {
    context.canvas.addAnnotation({ kind: 'geometric', shape: this.shape, ...this.base(context, rect) });
  }
}

export class AnnotationCircle extends GeometricAnnotationBuilder {
  constructor(options: GeometricAnnotationOptions = {}) { super('circle', options); }
  override build(context: RenderContext, rect: AnnotationRect): void {
    context.canvas.addAnnotation({ kind: 'geometric', shape: this.shape, ...this.base(context, rect) });
  }
}

export interface PointAnnotationOptions extends GeometricAnnotationOptions {
  readonly points: readonly PdfPoint[];
}

export class AnnotationPolygon extends GeometricAnnotationBuilder {
  readonly points: readonly PdfPoint[];

  constructor({ points, ...options }: PointAnnotationOptions, shape: 'polygon' | 'polyline' = 'polygon') {
    super(shape, options);
    if (points.length === 0) throw new RangeError('A point annotation needs at least one point');
    this.points = points;
  }

  override build(context: RenderContext, rect: AnnotationRect): void {
    const points = this.points.map(point =>
      context.canvas.transformWidgetPoint(rect.x + point.x, rect.y + point.y)
    );
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    const minimumX = Math.min(...xs);
    const minimumY = Math.min(...ys);
    context.canvas.addAnnotation({
      kind: 'geometric',
      shape: this.shape,
      ...this.base(context, rect),
      rect: {
        x: minimumX,
        y: minimumY,
        width: Math.max(...xs) - minimumX,
        height: Math.max(...ys) - minimumY
      },
      points
    });
  }
}

export interface InkAnnotationBuilderOptions extends GeometricAnnotationOptions {
  readonly points: readonly (readonly PdfPoint[])[];
}

export class AnnotationInk extends GeometricAnnotationBuilder {
  readonly points: readonly (readonly PdfPoint[])[];

  constructor({ points, ...options }: InkAnnotationBuilderOptions) {
    super('ink', options);
    if (points.flat().length === 0) throw new RangeError('An ink annotation needs at least one point');
    this.points = points;
  }

  override build(context: RenderContext, rect: AnnotationRect): void {
    const inkList = this.points.map(line => line.map(point =>
      context.canvas.transformWidgetPoint(rect.x + point.x, rect.y + point.y)
    ));
    const allPoints = inkList.flat();
    const xs = allPoints.map(point => point.x);
    const ys = allPoints.map(point => point.y);
    const minimumX = Math.min(...xs);
    const minimumY = Math.min(...ys);
    context.canvas.addAnnotation({
      kind: 'geometric',
      shape: this.shape,
      ...this.base(context, rect),
      rect: {
        x: minimumX,
        y: minimumY,
        width: Math.max(...xs) - minimumX,
        height: Math.max(...ys) - minimumY
      },
      inkList
    });
  }
}

export interface ShapeAnnotationOptions extends GeometricAnnotationOptions {
  readonly child?: AnyWidget | null;
}

export class SquareAnnotation extends Annotation {
  constructor({ child = null, color = null, interiorColor = null, border = null, ...options }: ShapeAnnotationOptions = {}) {
    super({
      child: child ?? new Rectangle({ fillColor: interiorColor, strokeColor: color, strokeWidth: border?.width ?? 1 }),
      builder: new AnnotationSquare({ color, interiorColor, border, ...options })
    });
  }
}

export class CircleAnnotation extends Annotation {
  constructor({ child = null, color = null, interiorColor = null, border = null, ...options }: ShapeAnnotationOptions = {}) {
    super({
      child: child ?? new Circle({ fillColor: interiorColor, strokeColor: color, strokeWidth: border?.width ?? 1 }),
      builder: new AnnotationCircle({ color, interiorColor, border, ...options })
    });
  }
}

export interface PolygonAnnotationOptions extends PointAnnotationOptions {
  readonly child?: AnyWidget | null;
}

export class PolygonAnnotation extends Annotation {
  constructor({ points, child = null, color = null, interiorColor = null, border = null, ...options }: PolygonAnnotationOptions) {
    super({
      child: child ?? new Polygon({ points, fillColor: interiorColor, strokeColor: color, strokeWidth: border?.width ?? 1 }),
      builder: new AnnotationPolygon({ points, color, interiorColor, border, ...options })
    });
  }
}

export class PolyLineAnnotation extends Annotation {
  constructor({ points, color = null, border = null, ...options }: PointAnnotationOptions) {
    super({
      child: new Polygon({ points, close: false, strokeColor: color, strokeWidth: border?.width ?? 1 }),
      builder: new AnnotationPolygon({ points, color, border, ...options }, 'polyline')
    });
  }
}

export interface InkAnnotationOptions extends InkAnnotationBuilderOptions {
  readonly child?: AnyWidget | null;
}

export class InkAnnotation extends Annotation {
  constructor({ points, child = null, color = null, border = null, ...options }: InkAnnotationOptions) {
    super({
      child: child ?? new InkList({ points, strokeColor: color, strokeWidth: border?.width ?? 1 }),
      builder: new AnnotationInk({ points, color, border, ...options })
    });
  }
}

export interface OutlineOptions extends AnchorOptions {
  readonly title: string;
  readonly level?: number;
  readonly color?: ColorInput | null;
  readonly style?: PdfOutlineStyle;
}

/** A named destination that also inserts a node in the document outline. */
export class Outline extends Anchor {
  readonly title: string;
  readonly level: number;
  readonly color: Rgb | null;
  readonly style: PdfOutlineStyle;

  constructor({ title, level = 0, color = null, style = 'normal', ...anchor }: OutlineOptions) {
    super({ ...anchor, setX: true });
    if (!Number.isInteger(level) || level < 0) throw new RangeError('Outline.level must be a non-negative integer');
    this.title = String(title);
    this.level = level;
    this.color = color === null ? null : normalizeColor(color);
    this.style = style;
  }

  override paint(context: RenderContext, box: PositionedBox<AnnotationLayoutData>): void {
    super.paint(context, box);
    context.document.registerOutline({
      title: this.title,
      level: this.level,
      pageNumber: context.pageNumber,
      y: context.canvas.transformWidgetPoint(box.x, box.y).y,
      anchor: this.name,
      color: this.color,
      style: this.style
    });
  }
}
