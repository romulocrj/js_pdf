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
 *   - pdf/lib/src/widgets/annotations.dart
 *
 * Annotation rectangles are registered during paint and carried with the
 * serialized page; widgets never retain page or layout state.
 */

import { BoxConstraints } from './geometry.ts';
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
