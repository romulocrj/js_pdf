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
 *   - pdf/lib/src/pdf/rect.dart
 *   - pdf/lib/src/pdf/point.dart
 *
 * Upstream's `PdfRect` is a PDF-space rectangle: `y` is its *bottom* and `top`
 * is the larger coordinate. That convention is kept here, because the only
 * things that use this type — path bounding boxes and SVG viewBoxes — are
 * likewise expressed in the space the canvas writes rather than the y-down space
 * the widget layer measures in. Widget boxes stay `LayoutBox`/`PositionedBox`.
 *
 * Both types are interfaces with a companion frozen object of factories rather
 * than classes: a plain object literal is a valid `PdfRect`, which keeps SVG
 * parsing free of allocation ceremony. `Alignment` in `widgets/geometry.ts` uses
 * the same shape.
 */

export interface PdfPoint {
  readonly x: number;
  readonly y: number;
}

export const PdfPoint = Object.freeze({
  zero: Object.freeze({ x: 0, y: 0 }) as PdfPoint,

  translate(point: PdfPoint, dx: number, dy: number): PdfPoint {
    return { x: point.x + dx, y: point.y + dy };
  }
});

export interface PdfRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const PdfRect = Object.freeze({
  zero: Object.freeze({ x: 0, y: 0, width: 0, height: 0 }) as PdfRect,

  fromLTRB(left: number, bottom: number, right: number, top: number): PdfRect {
    return { x: left, y: bottom, width: right - left, height: top - bottom };
  },

  left(rect: PdfRect): number {
    return rect.x;
  },

  bottom(rect: PdfRect): number {
    return rect.y;
  },

  right(rect: PdfRect): number {
    return rect.x + rect.width;
  },

  top(rect: PdfRect): number {
    return rect.y + rect.height;
  },

  horizontalCenter(rect: PdfRect): number {
    return rect.x + rect.width / 2;
  },

  verticalCenter(rect: PdfRect): number {
    return rect.y + rect.height / 2;
  },

  /** Edges moved outwards by `delta`; a negative delta deflates, as upstream. */
  inflate(rect: PdfRect, delta: number): PdfRect {
    return {
      x: rect.x - delta,
      y: rect.y - delta,
      width: rect.width + delta * 2,
      height: rect.height + delta * 2
    };
  },

  deflate(rect: PdfRect, delta: number): PdfRect {
    return PdfRect.inflate(rect, -delta);
  },

  scale(rect: PdfRect, factor: number): PdfRect {
    return {
      x: rect.x * factor,
      y: rect.y * factor,
      width: rect.width * factor,
      height: rect.height * factor
    };
  }
});
