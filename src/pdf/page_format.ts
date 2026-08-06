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

/**
 * Page dimensions in PDF points (1/72 inch), and the margins the format brings
 * with it — upstream `PdfPageFormat` carries both, and a page with no margin of
 * its own takes the format's.
 */
export interface PageSize {
  readonly width: number;
  readonly height: number;
  readonly marginTop?: number;
  readonly marginRight?: number;
  readonly marginBottom?: number;
  readonly marginLeft?: number;
}

const CM = 72 / 2.54;

/**
 * Only the two formats the port currently exercises are present; the upstream
 * `PdfPageFormat` carries the full ISO/US set plus marginless variants. The
 * margins are upstream's: 2 cm on ISO paper, one inch on US paper.
 */
export const PageFormat: Readonly<Record<'A4' | 'LETTER', PageSize>> = Object.freeze({
  A4: Object.freeze({
    width: 595.28,
    height: 841.89,
    marginTop: 2 * CM,
    marginRight: 2 * CM,
    marginBottom: 2 * CM,
    marginLeft: 2 * CM
  }),
  LETTER: Object.freeze({
    width: 612,
    height: 792,
    marginTop: 72,
    marginRight: 72,
    marginBottom: 72,
    marginLeft: 72
  })
});

/**
 * The margin a page falls back to when neither it nor its format states one.
 * Upstream has no such value — a `PdfPageFormat` always carries margins — so
 * this covers the port's bare `{ width, height }` formats alone.
 */
export const DEFAULT_MARGIN = 40;

/** The margins a format declares, or `null` when it declares none. */
export function formatMargin(format: PageSize): {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
} | null {
  const { marginTop, marginRight, marginBottom, marginLeft } = format;
  if (
    marginTop === undefined
    && marginRight === undefined
    && marginBottom === undefined
    && marginLeft === undefined
  ) {
    return null;
  }

  return {
    top: marginTop ?? 0,
    right: marginRight ?? 0,
    bottom: marginBottom ?? 0,
    left: marginLeft ?? 0
  };
}

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
