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
 *   - pdf/lib/src/pdf/page_format.dart
 */

/** Page dimensions in PDF points (1/72 inch). */
export interface PageSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Only the two formats the port currently exercises are present; the upstream
 * `PdfPageFormat` carries the full ISO/US set plus marginless variants.
 */
export const PageFormat: Readonly<Record<'A4' | 'LETTER', PageSize>> = Object.freeze({
  A4: Object.freeze({ width: 595.28, height: 841.89 }),
  LETTER: Object.freeze({ width: 612, height: 792 })
});

export const DEFAULT_MARGIN = 40;

/**
 * One physical unit in PDF points. Upstream holds these as statics on
 * `PdfPageFormat`; SVG needs them because a length may be written `10mm`.
 */
export const PageUnit = Object.freeze({
  point: 1,
  inch: 72,
  cm: 72 / 2.54,
  mm: 72 / 25.4,
  pica: 12
});
