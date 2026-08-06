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
 *   - pdf/lib/src/widgets/image.dart
 *
 * Crop geometry is part of the layout result rather than cached on the widget.
 * Painting delegates widget-to-PDF coordinate conversion to `PdfCanvas`.
 */

import type { PdfImage } from '../pdf/obj/image.ts';
import type { ColorInput } from '../pdf/color.ts';
import type { PdfRect } from '../pdf/rect.ts';
import { drawShape, shapeBoundingBox } from '../svg/path.ts';
import { applyBoxFit, resolveBasicAlignment } from './basic.ts';
import type { BasicAlignmentInput, FitSize } from './basic.ts';
import { BoxConstraints, inscribe } from './geometry.ts';
import type { BoxFit } from './svg.ts';
import { Widget } from './widget.ts';
import type { Constraints, LayoutBox, PositionedBox, RenderContext } from './widget.ts';
import type { ImageProvider } from './image_provider.ts';

export interface ImageOptions {
  readonly fit?: BoxFit;
  readonly alignment?: BasicAlignmentInput;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly dpi?: number | null;
}

export interface ImageLayoutData {
  readonly image: PdfImage;
  readonly source: FitSize;
  readonly destination: FitSize;
  readonly sourceX: number;
  readonly sourceY: number;
  readonly destinationX: number;
  readonly destinationY: number;
}

export class Image extends Widget<ImageLayoutData> {
  readonly image: ImageProvider;
  readonly fit: BoxFit;
  readonly alignment: ReturnType<typeof resolveBasicAlignment>;
  readonly width: number | null;
  readonly height: number | null;
  readonly dpi: number | null;

  constructor(image: ImageProvider, {
    fit = 'contain',
    alignment = 'center',
    width = null,
    height = null,
    dpi = null
  }: ImageOptions = {}) {
    super();
    applyBoxFit(fit, { width: 1, height: 1 }, { width: 1, height: 1 });
    if (width !== null && (!Number.isFinite(width) || width < 0)) throw new RangeError('Image width must be non-negative');
    if (height !== null && (!Number.isFinite(height) || height < 0)) throw new RangeError('Image height must be non-negative');
    if (dpi !== null && (!Number.isFinite(dpi) || dpi <= 0)) throw new RangeError('Image DPI must be positive');
    this.image = image;
    this.fit = fit;
    this.alignment = resolveBasicAlignment(alignment);
    this.width = width;
    this.height = height;
    this.dpi = dpi;
  }

  override layout(_context: RenderContext, constraints: Constraints): LayoutBox<ImageLayoutData> {
    const parent = BoxConstraints.from(constraints);
    const offered = {
      width: parent.constrainWidth(this.width ?? (parent.hasBoundedWidth ? parent.maxWidth : this.image.width)),
      height: parent.constrainHeight(this.height ?? (parent.hasBoundedHeight ? parent.maxHeight : this.image.height))
    };
    const layoutFit = applyBoxFit(
      this.fit,
      { width: this.image.width, height: this.image.height },
      offered
    );
    const image = this.image.resolve(
      { x: layoutFit.destination.width, y: layoutFit.destination.height },
      this.dpi
    );
    const fitted = applyBoxFit(
      this.fit,
      { width: image.width, height: image.height },
      layoutFit.destination
    );
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
      layoutFit.destination.width,
      layoutFit.destination.height
    );
    return {
      widget: this,
      width: layoutFit.destination.width,
      height: layoutFit.destination.height,
      data: {
        image,
        source: fitted.source,
        destination: fitted.destination,
        sourceX: sourceOffset.dx,
        sourceY: sourceOffset.dy,
        destinationX: destinationOffset.dx,
        destinationY: destinationOffset.dy
      }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<ImageLayoutData>): void {
    const data = box.data;
    if (data.source.width <= 0 || data.source.height <= 0) return;
    const scaleX = data.destination.width / data.source.width;
    const scaleY = data.destination.height / data.source.height;
    const destinationX = box.x + data.destinationX;
    const destinationY = box.y + data.destinationY;
    const fullWidth = data.image.width * scaleX;
    const fullHeight = data.image.height * scaleY;
    const fullX = destinationX - data.sourceX * scaleX;
    const fullTop = destinationY - data.sourceY * scaleY;

    context.canvas.saveContext();
    context.canvas.drawRect(
      destinationX,
      context.canvas.toPdfY(destinationY + data.destination.height),
      data.destination.width,
      data.destination.height
    );
    context.canvas.clipPath();
    context.canvas.drawImage(
      data.image,
      fullX,
      context.canvas.toPdfY(fullTop + fullHeight),
      fullWidth,
      fullHeight
    );
    context.canvas.restoreContext();
  }
}

export interface ShapeOptions {
  readonly strokeColor?: ColorInput | null;
  readonly fillColor?: ColorInput | null;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly fit?: BoxFit;
}

export interface ShapeLayoutData {
  readonly boundingBox: PdfRect;
}

/** Draws an SVG path-data string fitted into the available widget box. */
export class Shape extends Widget<ShapeLayoutData> {
  readonly shape: string;
  readonly strokeColor: ColorInput | null;
  readonly fillColor: ColorInput | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly fit: BoxFit;

  constructor(shape: string, {
    strokeColor = null,
    fillColor = null,
    width = null,
    height = null,
    fit = 'contain'
  }: ShapeOptions = {}) {
    super();
    this.shape = String(shape);
    this.strokeColor = strokeColor;
    this.fillColor = fillColor;
    this.width = width;
    this.height = height;
    this.fit = fit;
    if (width !== null && width <= 0) throw new RangeError('Shape width must be positive');
    if (height !== null && height <= 0) throw new RangeError('Shape height must be positive');
  }

  override layout(_context: RenderContext, constraints: Constraints): LayoutBox<ShapeLayoutData> {
    const parent = BoxConstraints.from(constraints);
    const measured = this.width === null || this.height === null
      ? shapeBoundingBox(this.shape)
      : { x: 0, y: 0, width: this.width, height: this.height };
    const offered = {
      width: parent.hasBoundedWidth ? parent.maxWidth : parent.constrainWidth(measured.width),
      height: parent.hasBoundedHeight ? parent.maxHeight : parent.constrainHeight(measured.height)
    };
    const fitted = applyBoxFit(this.fit, measured, offered);
    return {
      widget: this,
      width: fitted.destination.width,
      height: fitted.destination.height,
      data: { boundingBox: measured }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<ShapeLayoutData>): void {
    const bounds = box.data.boundingBox;
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const scaleX = box.width / bounds.width;
    const scaleY = box.height / bounds.height;
    context.canvas.saveContext();
    context.canvas.setTransform([
      scaleX,
      0,
      0,
      scaleY,
      box.x - bounds.x * scaleX,
      context.canvas.pageHeight - box.y - (bounds.y + bounds.height) * scaleY
    ]);
    if (this.fillColor !== null) {
      context.canvas.setFillColor(this.fillColor);
      drawShape(context.canvas, this.shape);
      context.canvas.fillPath();
    }
    if (this.strokeColor !== null) {
      context.canvas.setStrokeColor(this.strokeColor);
      drawShape(context.canvas, this.shape);
      context.canvas.strokePath();
    }
    context.canvas.restoreContext();
  }
}
