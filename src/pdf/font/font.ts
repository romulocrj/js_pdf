/*
 * Ported to JavaScript from DavBfr/dart_pdf.
 *
 * Original work:
 * Copyright (C) 2017, David PHAM-VAN
 *
 * JavaScript port:
 * Copyright (C) 2026, Romulo Campos
 *
 * This file has been substantially modified from the original Dart source.
 *
 * Licensed under the Apache License, Version 2.0.
 *
 * Original Dart sources ported into this file:
 *   - pdf/lib/src/pdf/obj/font.dart
 */

import type { PdfFontMetrics } from './font_metrics.ts';

/** Common contract for standard fonts now and embedded fonts in phase 1. */
export interface PdfFont {
  readonly fontName: string;
  readonly ascent: number;
  readonly descent: number;

  stringMetrics(text: string, size: number, letterSpacing?: number): PdfFontMetrics;
  encodeText(text: string): string;
  resourceDict(): string;
}
