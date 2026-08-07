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
 *   - pdf/lib/src/widgets/decoration.dart
 *
 * Box shadows use concentric vector fills because the port has no raster
 * subsystem until phase 4. The result stays synchronous and host-independent,
 * while preserving offset, spread, blur extent, colour and opacity.
 */

import { normalizeColor } from '../pdf/color.ts';
import type { ColorInput, Rgb } from '../pdf/color.ts';
import { PdfGraphicState } from '../pdf/graphic_state.ts';
import type { PdfPoint, PdfRect } from '../pdf/rect.ts';
import { PdfBaseFunction } from '../pdf/obj/function.ts';
import { PdfShadingPattern } from '../pdf/obj/pattern.ts';
import { PdfShading } from '../pdf/obj/shading.ts';
import { BorderRadius, BorderRadiusGeometry } from './border_radius.ts';
import type { RadiusValue, TextDirection } from './border_radius.ts';
import { BoxBorder, normalizeBoxBorder } from './box_border.ts';
import type { BoxBorderInput } from './box_border.ts';
import { applyBoxFit, resolveBasicAlignment } from './basic.ts';
import type { BasicAlignmentInput } from './basic.ts';
import { Alignment, inscribe } from './geometry.ts';
import type { BoxFit } from './svg.ts';
import type { ImageProvider } from './image_provider.ts';
import type { RenderContext } from './widget.ts';

export type DecorationPosition = 'background' | 'foreground';
export type TileMode = 'clamp';
export type BoxShape = 'circle' | 'rectangle';
export type PaintPhase = 'all' | 'background' | 'foreground';

/** A graphic that can paint inside a decoration box. */
export abstract class DecorationGraphic {
  abstract paint(context: RenderContext, box: PdfRect): void;
}

export interface DecorationImageOptions {
  readonly image: ImageProvider;
  readonly fit?: BoxFit;
  readonly alignment?: BasicAlignmentInput;
  readonly dpi?: number | null;
}

/** An image fitted, aligned and clipped inside a decoration box. */
export class DecorationImage extends DecorationGraphic {
  readonly image: ImageProvider;
  readonly fit: BoxFit;
  readonly alignment: Alignment;
  readonly dpi: number | null;

  constructor({
    image,
    fit = 'cover',
    alignment = 'center',
    dpi = null
  }: DecorationImageOptions) {
    super();
    applyBoxFit(fit, { width: 1, height: 1 }, { width: 1, height: 1 });
    if (dpi !== null && (!Number.isFinite(dpi) || dpi <= 0)) {
      throw new RangeError('Decoration image DPI must be positive');
    }
    this.image = image;
    this.fit = fit;
    this.alignment = resolveBasicAlignment(alignment);
    this.dpi = dpi;
  }

  override paint(context: RenderContext, box: PdfRect): void {
    if (box.width <= 0 || box.height <= 0) return;
    const image = this.image.resolve({ x: box.width, y: box.height }, this.dpi);
    const fitted = applyBoxFit(
      this.fit,
      { width: image.width, height: image.height },
      { width: box.width, height: box.height }
    );
    if (fitted.source.width <= 0 || fitted.source.height <= 0) return;

    const sourceOffset = inscribe(
      this.alignment,
      fitted.source.width,
      fitted.source.height,
      image.width,
      image.height
    );
    const destinationOffset = inscribe(
      this.alignment,
      fitted.destination.width,
      fitted.destination.height,
      box.width,
      box.height
    );
    const scaleX = fitted.destination.width / fitted.source.width;
    const scaleY = fitted.destination.height / fitted.source.height;
    const boxTop = context.canvas.pageHeight - box.y - box.height;
    const destinationX = box.x + destinationOffset.dx;
    const destinationTop = boxTop + destinationOffset.dy;
    const fullWidth = image.width * scaleX;
    const fullHeight = image.height * scaleY;
    const fullX = destinationX - sourceOffset.dx * scaleX;
    const fullTop = destinationTop - sourceOffset.dy * scaleY;

    context.canvas.saveContext();
    context.canvas.drawBox(box);
    context.canvas.clipPath();
    context.canvas.drawImage(
      image,
      fullX,
      context.canvas.toPdfY(fullTop + fullHeight),
      fullWidth,
      fullHeight
    );
    context.canvas.restoreContext();
  }
}

function alignmentPoint(alignment: Alignment, box: PdfRect): PdfPoint {
  return {
    x: box.x + ((alignment.x + 1) * box.width) / 2,
    y: box.y + ((alignment.y + 1) * box.height) / 2
  };
}

export interface GradientOptions {
  readonly colors: readonly ColorInput[];
  readonly stops?: readonly number[] | null;
}

/** A colour ramp capable of painting the current decoration path. */
export abstract class Gradient {
  readonly colors: readonly Rgb[];
  readonly stops: readonly number[];

  constructor({ colors, stops = null }: GradientOptions) {
    if (colors.length === 0) throw new RangeError('A gradient needs at least one colour');
    if (stops !== null && stops.length !== colors.length) {
      throw new RangeError('The number of gradient colours must match the number of stops');
    }
    this.colors = colors.map(color => normalizeColor(color));
    this.stops = stops === null ? [] : stops.map(value => Math.min(1, Math.max(0, Number(value))));
  }

  abstract paint(context: RenderContext, box: PdfRect): void;
}

export interface LinearGradientOptions extends GradientOptions {
  readonly begin?: Alignment;
  readonly end?: Alignment;
  readonly tileMode?: TileMode;
}

/** An axial PDF shading between two alignment points. */
export class LinearGradient extends Gradient {
  readonly begin: Alignment;
  readonly end: Alignment;
  readonly tileMode: TileMode;

  constructor({
    colors,
    stops = null,
    begin = Alignment.centerLeft,
    end = Alignment.centerRight,
    tileMode = 'clamp'
  }: LinearGradientOptions) {
    super({ colors, stops });
    this.begin = begin;
    this.end = end;
    this.tileMode = tileMode;
  }

  override paint(context: RenderContext, box: PdfRect): void {
    const pattern = new PdfShadingPattern({
      shading: new PdfShading({
        type: 'axial',
        boundingBox: box,
        fn: PdfBaseFunction.colorsAndStops(this.colors, this.stops),
        start: alignmentPoint(this.begin, box),
        end: alignmentPoint(this.end, box),
        extendStart: true,
        extendEnd: true
      })
    });
    context.canvas.setFillPattern(pattern);
    context.canvas.drawBox(box);
    context.canvas.fillPath();
  }
}

export interface RadialGradientOptions extends GradientOptions {
  readonly center?: Alignment;
  readonly radius?: number;
  readonly tileMode?: TileMode;
  readonly focal?: Alignment | null;
  readonly focalRadius?: number;
}

/** A radial PDF shading with optional independent focal point. */
export class RadialGradient extends Gradient {
  readonly center: Alignment;
  readonly radius: number;
  readonly tileMode: TileMode;
  readonly focal: Alignment | null;
  readonly focalRadius: number;

  constructor({
    colors,
    stops = null,
    center = Alignment.center,
    radius = 0.5,
    tileMode = 'clamp',
    focal = null,
    focalRadius = 0
  }: RadialGradientOptions) {
    super({ colors, stops });
    this.center = center;
    this.radius = Math.max(0, Number(radius));
    this.tileMode = tileMode;
    this.focal = focal;
    this.focalRadius = Math.max(0, Number(focalRadius));
  }

  override paint(context: RenderContext, box: PdfRect): void {
    const scale = Math.min(box.width, box.height);
    const pattern = new PdfShadingPattern({
      shading: new PdfShading({
        type: 'radial',
        boundingBox: box,
        fn: PdfBaseFunction.colorsAndStops(this.colors, this.stops),
        start: alignmentPoint(this.focal ?? this.center, box),
        end: alignmentPoint(this.center, box),
        radius0: this.focalRadius * scale,
        radius1: this.radius * scale,
        extendStart: true,
        extendEnd: true
      })
    });
    context.canvas.setFillPattern(pattern);
    context.canvas.drawBox(box);
    context.canvas.fillPath();
  }
}

export interface BoxShadowOptions {
  readonly color?: ColorInput;
  readonly offset?: PdfPoint;
  readonly blurRadius?: number;
  readonly spreadRadius?: number;
  readonly opacity?: number;
}

/** One vector shadow layer. */
export class BoxShadow {
  readonly color: Rgb;
  readonly offset: PdfPoint;
  readonly blurRadius: number;
  readonly spreadRadius: number;
  readonly opacity: number;

  constructor({
    color = '#000000',
    offset = { x: 0, y: 0 },
    blurRadius = 0,
    spreadRadius = 0,
    opacity = 0.25
  }: BoxShadowOptions = {}) {
    this.color = normalizeColor(color);
    this.offset = { x: Number(offset.x), y: Number(offset.y) };
    this.blurRadius = Math.max(0, Number(blurRadius));
    this.spreadRadius = Number(spreadRadius);
    this.opacity = Math.min(1, Math.max(0, Number(opacity)));
  }
}

export type BoxShadowInput = BoxShadow | BoxShadowOptions;

function appendShape(
  context: RenderContext,
  x: number,
  y: number,
  width: number,
  height: number,
  shape: BoxShape,
  borderRadius: BorderRadius | null
): void {
  const { canvas } = context;
  if (shape === 'circle') {
    canvas.drawEllipse(
      x + width / 2,
      canvas.pageHeight - y - height / 2,
      width / 2,
      height / 2
    );
  } else if (borderRadius !== null) {
    borderRadius.paint(canvas, x, y, width, height);
  } else {
    canvas.drawRect(x, canvas.pageHeight - y - height, width, height);
  }
}

function paintShadow(
  context: RenderContext,
  shadow: BoxShadow,
  x: number,
  y: number,
  width: number,
  height: number,
  shape: BoxShape,
  borderRadius: BorderRadius | null
): void {
  if (shadow.opacity === 0) return;
  const steps = shadow.blurRadius === 0 ? 1 : Math.max(4, Math.min(16, Math.ceil(shadow.blurRadius)));
  for (let index = steps; index >= 1; index--) {
    const blur = shadow.blurRadius * index / steps;
    const spread = shadow.spreadRadius + blur;
    const alpha = shadow.opacity * (steps === 1 ? 1 : (1 - index / (steps + 1)) / steps);
    context.canvas.saveContext();
    context.canvas.setGraphicState(new PdfGraphicState({ fillOpacity: alpha }));
    context.canvas.setFillColor(shadow.color);
    appendShape(
      context,
      x + shadow.offset.x - spread,
      y + shadow.offset.y - spread,
      width + spread * 2,
      height + spread * 2,
      shape,
      borderRadius
    );
    context.canvas.fillPath();
    context.canvas.restoreContext();
  }
}

export interface BoxDecorationOptions {
  readonly color?: ColorInput | null;
  readonly border?: BoxBorderInput | null;
  readonly borderRadius?: BorderRadiusGeometry | RadiusValue | null;
  readonly boxShadow?: readonly BoxShadowInput[] | null;
  readonly gradient?: Gradient | null;
  readonly image?: DecorationGraphic | null;
  readonly shape?: BoxShape;
}

/** Background fill, gradient, shadows and foreground border for a box. */
export class BoxDecoration {
  readonly color: Rgb | null;
  readonly border: BoxBorder | null;
  readonly borderRadius: BorderRadiusGeometry | null;
  readonly boxShadow: readonly BoxShadow[];
  readonly gradient: Gradient | null;
  readonly image: DecorationGraphic | null;
  readonly shape: BoxShape;

  constructor({
    color = null,
    border = null,
    borderRadius = null,
    boxShadow = null,
    gradient = null,
    image = null,
    shape = 'rectangle'
  }: BoxDecorationOptions = {}) {
    this.color = color === null ? null : normalizeColor(color);
    this.border = normalizeBoxBorder(border);
    this.borderRadius = borderRadius === null
      ? null
      : borderRadius instanceof BorderRadiusGeometry
        ? borderRadius
        : BorderRadius.all(borderRadius);
    this.boxShadow = boxShadow === null
      ? []
      : boxShadow.map(value => value instanceof BoxShadow ? value : new BoxShadow(value));
    this.gradient = gradient;
    this.image = image;
    this.shape = shape;
    if (shape === 'circle' && borderRadius !== null) {
      throw new Error('A circular BoxDecoration cannot have a border radius');
    }
  }

  paint(
    context: RenderContext,
    x: number,
    y: number,
    width: number,
    height: number,
    phase: PaintPhase = 'all',
    direction: TextDirection = 'ltr'
  ): void {
    const resolvedRadius = this.borderRadius?.resolve(direction) ?? null;
    const box = { x, y: context.canvas.pageHeight - y - height, width, height };

    if (phase === 'all' || phase === 'background') {
      for (const shadow of this.boxShadow) {
        paintShadow(context, shadow, x, y, width, height, this.shape, resolvedRadius);
      }

      if (this.color !== null) {
        if (this.shape === 'rectangle' && resolvedRadius === null) {
          context.canvas.fillRect(x, y, width, height, this.color);
        } else {
          context.canvas.setFillColor(this.color);
          appendShape(context, x, y, width, height, this.shape, resolvedRadius);
          context.canvas.fillPath();
        }
      }

      if (this.gradient !== null) {
        context.canvas.saveContext();
        appendShape(context, x, y, width, height, this.shape, resolvedRadius);
        context.canvas.clipPath();
        this.gradient.paint(context, box);
        context.canvas.restoreContext();
      }

      if (this.image !== null) {
        context.canvas.saveContext();
        if (this.shape === 'circle' || resolvedRadius !== null) {
          appendShape(context, x, y, width, height, this.shape, resolvedRadius);
          context.canvas.clipPath();
        }
        this.image.paint(context, box);
        context.canvas.restoreContext();
      }
    }

    if (phase === 'all' || phase === 'foreground') {
      this.border?.paint(context, x, y, width, height, {
        shape: this.shape,
        borderRadius: resolvedRadius
      });
    }
  }
}

export type BoxDecorationInput = BoxDecoration | BoxDecorationOptions;

export function normalizeBoxDecoration(value: BoxDecorationInput | null | undefined): BoxDecoration | null {
  if (value === null || value === undefined) return null;
  return value instanceof BoxDecoration ? value : new BoxDecoration(value);
}
