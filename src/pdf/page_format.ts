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
const MM = 72 / 25.4;

/** Upstream paper presets, in points, including their default margins. */
function paper(width: number, height: number, margin: number): PageSize {
  return Object.freeze({
    width, height,
    marginTop: margin, marginRight: margin, marginBottom: margin, marginLeft: margin
  });
}

// Preserve the port's historical rounded A4 dimensions for existing callers.
const A4 = paper(595.28, 841.89, 2 * CM);

/** Infinite dimensions are fitted to the body by Page; MultiPage needs finite paper. */
export const PageFormat = Object.freeze({
  A3: paper(29.7 * CM, 42 * CM, 2 * CM),
  A4,
  A5: paper(14.8 * CM, 21 * CM, 2 * CM),
  A6: paper(105 * MM, 148 * MM, CM),
  LETTER: paper(612, 792, 72),
  LEGAL: paper(612, 1008, 72),
  ROLL57: paper(57 * MM, Infinity, 5 * MM),
  ROLL80: paper(80 * MM, Infinity, 5 * MM),
  UNDEFINED: paper(Infinity, Infinity, 0),
  STANDARD: A4
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
  pica: 12,
  dp: 72 / 150
});
