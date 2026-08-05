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
 *   - pdf/lib/src/pdf/font/font_metrics.dart
 *   - pdf/lib/src/pdf/font/type1_fonts.dart
 *
 * PORT GAP: upstream ships the real AFM advance-width tables for the 14
 * standard Type1 fonts and reads `hmtx` for embedded TTF. This file is a
 * character-class approximation and is the single largest source of layout
 * drift against dart_pdf. It is scheduled for replacement in phase 0.1 of
 * docs/ROADMAP.md, which also introduces the `PdfFont` interface.
 */

function estimateCharacterWidth(character: string, fontSize: number): number {
  if (character === ' ') return fontSize * 0.278;
  if ('ilI.,:;!|'.includes(character)) return fontSize * 0.26;
  if ('mwMW@%'.includes(character)) return fontSize * 0.83;
  if (/[A-Z0-9]/.test(character)) return fontSize * 0.61;
  return fontSize * 0.51;
}

/** Advance width of `text` at `fontSize`, in PDF points. */
export function estimateTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const character of String(text)) {
    width += estimateCharacterWidth(character, fontSize);
  }
  return width;
}
