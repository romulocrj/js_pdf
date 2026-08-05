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
 *   - pdf/lib/src/widgets/image.dart
 *
 * Crop geometry is part of the layout result rather than cached on the widget.
 * Painting converts the widget layer's top-left coordinates only at the final
 * `PdfCanvas.drawImage` call.
 */

import type { PdfImage } from '../pdf/obj/image.ts';
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
    this.image = image;
    this.fit = fit;
    this.alignment = resolveBasicAlignment(alignment);
    this.width = width;
    this.height = height;
    this.dpi = dpi;
  }

  override layout(_context: RenderContext, constraints: Constraints): LayoutBox<ImageLayoutData> {
    const parent = BoxConstraints.from(constraints);
    const image = this.image.resolve();
    const offered = {
      width: parent.constrainWidth(this.width ?? (parent.hasBoundedWidth ? parent.maxWidth : this.image.width)),
      height: parent.constrainHeight(this.height ?? (parent.hasBoundedHeight ? parent.maxHeight : this.image.height))
    };
    const fitted = applyBoxFit(
      this.fit,
      { width: this.image.width, height: this.image.height },
      offered
    );
    const sourceOffset = inscribe(
      this.alignment,
      fitted.source.width,
      fitted.source.height,
      this.image.width,
      this.image.height
    );
    const destinationOffset = inscribe(
      this.alignment,
      fitted.destination.width,
      fitted.destination.height,
      offered.width,
      offered.height
    );
    return {
      widget: this,
      width: fitted.destination.width,
      height: fitted.destination.height,
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
    const fullWidth = this.image.width * scaleX;
    const fullHeight = this.image.height * scaleY;
    const fullX = destinationX - data.sourceX * scaleX;
    const fullTop = destinationY - data.sourceY * scaleY;

    context.canvas.saveContext();
    context.canvas.drawRect(
      destinationX,
      context.canvas.pageHeight - destinationY - data.destination.height,
      data.destination.width,
      data.destination.height
    );
    context.canvas.clipPath();
    context.canvas.drawImage(
      data.image,
      fullX,
      context.canvas.pageHeight - fullTop - fullHeight,
      fullWidth,
      fullHeight
    );
    context.canvas.restoreContext();
  }
}
