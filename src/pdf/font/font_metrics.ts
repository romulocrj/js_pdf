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
 *   - pdf/lib/src/pdf/font/font_metrics.dart
 */

export interface PdfFontMetricsOptions {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly ascent?: number;
  readonly descent?: number;
  readonly advanceWidth?: number;
  readonly leftBearing?: number;
}

/** Bounding box and advance measurements for a glyph or a string. */
export class PdfFontMetrics {
  static readonly zero = new PdfFontMetrics({
    left: 0,
    top: 0,
    right: 0,
    bottom: 0
  });

  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly ascent: number;
  readonly descent: number;
  readonly advanceWidth: number;
  readonly leftBearing: number;

  constructor({
    left,
    top,
    right,
    bottom,
    ascent = bottom,
    descent = top,
    advanceWidth = right - left,
    leftBearing = left
  }: PdfFontMetricsOptions) {
    this.left = left;
    this.top = top;
    this.right = right;
    this.bottom = bottom;
    this.ascent = ascent;
    this.descent = descent;
    this.advanceWidth = advanceWidth;
    this.leftBearing = leftBearing;
  }

  static append(metrics: Iterable<PdfFontMetrics>, letterSpacing = 0): PdfFontMetrics {
    let left: number | undefined;
    let top: number | undefined;
    let bottom: number | undefined;
    let ascent: number | undefined;
    let descent: number | undefined;
    let advanceWidth = 0;
    let firstBearing: number | undefined;
    let lastBearing = 0;
    let lastSpacing = 0;

    for (const metric of metrics) {
      left ??= metric.left;
      top = Math.min(top ?? metric.top, metric.top);
      bottom = Math.max(bottom ?? metric.bottom, metric.bottom);
      ascent = Math.max(ascent ?? metric.ascent, metric.ascent);
      descent = Math.min(descent ?? metric.descent, metric.descent);
      firstBearing ??= metric.leftBearing;
      lastBearing = metric.rightBearing;
      lastSpacing = metric.advanceWidth > 0 ? letterSpacing : 0;
      advanceWidth += metric.advanceWidth + lastSpacing;
    }

    if (left === undefined || top === undefined || bottom === undefined ||
        ascent === undefined || descent === undefined || firstBearing === undefined) {
      return PdfFontMetrics.zero;
    }

    return new PdfFontMetrics({
      left,
      top,
      right: advanceWidth - lastBearing - lastSpacing,
      bottom,
      ascent,
      descent,
      advanceWidth: advanceWidth - lastSpacing,
      leftBearing: firstBearing
    });
  }

  get width(): number {
    return this.right - this.left;
  }

  get height(): number {
    return this.bottom - this.top;
  }

  get maxWidth(): number {
    return Math.max(this.advanceWidth, this.right) + Math.max(-this.leftBearing, 0);
  }

  get maxHeight(): number {
    return this.ascent - this.descent;
  }

  get effectiveLeft(): number {
    return Math.min(this.leftBearing, 0);
  }

  get rightBearing(): number {
    return this.advanceWidth - this.right;
  }

  scale(factor: number): PdfFontMetrics {
    return new PdfFontMetrics({
      left: this.left * factor,
      top: this.top * factor,
      right: this.right * factor,
      bottom: this.bottom * factor,
      ascent: this.ascent * factor,
      descent: this.descent * factor,
      advanceWidth: this.advanceWidth * factor,
      leftBearing: this.leftBearing * factor
    });
  }
}
