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
 *   - pdf/lib/src/pdf/obj/formxobject.dart
 *
 */

import { PdfCanvas } from '../graphics.ts';
import type { PdfFormAppearance } from './annotation.ts';

export interface PdfFormXObjectOptions {
  readonly width: number;
  readonly height: number;
  readonly paint: (canvas: PdfCanvas) => void;
}
/** Reusable content snapshot. Paint uses the same coordinates as PdfCanvas. */
export class PdfFormXObject {
  readonly appearance: PdfFormAppearance;
  readonly width: number;
  readonly height: number;
  constructor({ width, height, paint }: PdfFormXObjectOptions) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new RangeError('Form dimensions must be finite and positive');
    const canvas = new PdfCanvas(height);
    paint(canvas);
    if (canvas.annotations.length > 0) throw new TypeError('Reusable forms cannot own page annotations');
    this.width = width; this.height = height;
    this.appearance = { width, height, content: canvas.output(), fonts: new Map(canvas.fonts),
      images: new Map(canvas.images), graphicStates: new Map(canvas.graphicStates),
      patterns: new Map(canvas.patterns), shadings: new Map(canvas.shadings), forms: new Map(canvas.forms) };
  }
}
