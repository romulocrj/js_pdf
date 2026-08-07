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
 * Masked elements are wrapped in a luminosity soft-mask form by `SvgPainter`.
 */

import { PdfGraphicState } from '../pdf/graphic_state.ts';
import type { PdfCanvas } from '../pdf/graphics.ts';
import type { PdfRect } from '../pdf/rect.ts';
import type { SvgBrush } from './brush.ts';
import type { SvgClipPath } from './clip_path.ts';
import type { SvgPainter } from './painter.ts';
import type { SvgTransform } from './transform.ts';

export abstract class SvgOperation {
  readonly brush: SvgBrush;
  readonly clip: SvgClipPath;
  readonly transform: SvgTransform;
  readonly painter: SvgPainter;

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

    this.clip.apply(canvas, this.boundingBox());

    if (this.transform.matrix !== null) {
      canvas.setTransform(this.transform.matrix);
    }

    if ((this.brush.opacity ?? 1) < 1 || this.brush.blendMode !== null) {
      canvas.setGraphicState(new PdfGraphicState({
        opacity: this.brush.opacity === 1 ? null : this.brush.opacity,
        blendMode: this.brush.blendMode
      }));
    }

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
