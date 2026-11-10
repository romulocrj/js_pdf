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
 *   - pdf/lib/src/svg/operation.dart
 *
 * The common paint scope for every SVG operation.
 *
 * The element's own transform comes first, then its clip-path and mask: both
 * are in the user space the transform establishes (SVG 1.1 14.3.5, 14.4).
 * Upstream clips before the transform, so a transformed, clipped element was
 * clipped in its parent's space; the port's mask used to be set outside the
 * transform too, so a transformed masked element vanished.
 */

import { PdfGraphicState } from '../pdf/graphic_state.ts';
import type { PdfCanvas } from '../pdf/graphics.ts';
import type { PdfRect } from '../pdf/rect.ts';
import type { SvgBrush } from './brush.ts';
import type { SvgClipPath } from './clip_path.ts';
import type { SvgMask } from './mask_path.ts';
import type { SvgPainter } from './painter.ts';
import type { SvgTransform } from './transform.ts';

export abstract class SvgOperation {
  readonly brush: SvgBrush;
  readonly clip: SvgClipPath;
  readonly transform: SvgTransform;
  readonly painter: SvgPainter;

  /** The resolved `mask` reference; set by the painter once, at build time. */
  mask: SvgMask | null = null;

  constructor(
    brush: SvgBrush,
    clip: SvgClipPath,
    transform: SvgTransform,
    painter: SvgPainter
  ) {
    this.brush = brush;
    this.clip = clip;
    this.transform = transform;
    this.painter = painter;
  }

  paint(canvas: PdfCanvas): void {
    canvas.saveContext();

    if (this.transform.matrix !== null) {
      canvas.setTransform(this.transform.matrix);
    }

    this.clip.apply(canvas, this.boundingBox());

    if ((this.brush.opacity ?? 1) < 1 || this.brush.blendMode !== null) {
      canvas.setGraphicState(new PdfGraphicState({
        opacity: this.brush.opacity === 1 ? null : this.brush.opacity,
        blendMode: this.brush.blendMode
      }));
    }

    this.mask?.apply(canvas);
    this.paintShape(canvas);
    canvas.restoreContext();
  }

  draw(canvas: PdfCanvas): void {
    canvas.saveContext();
    if (this.transform.matrix !== null) {
      canvas.setTransform(this.transform.matrix);
    }
    this.drawShape(canvas);
    canvas.restoreContext();
  }

  protected abstract paintShape(canvas: PdfCanvas): void;
  protected abstract drawShape(canvas: PdfCanvas): void;
  abstract boundingBox(): PdfRect;
}
