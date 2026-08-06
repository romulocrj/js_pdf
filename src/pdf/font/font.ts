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
 *   - pdf/lib/src/pdf/obj/font.dart
 */

import type { PdfDict } from '../format/dict.ts';
import type { PdfObjectRegistry } from '../obj/object.ts';
import type { PdfFontMetrics } from './font_metrics.ts';

/** Common contract for the standard Type1 fonts and for embedded TrueType. */
export interface PdfFont {
  readonly fontName: string;
  readonly ascent: number;
  readonly descent: number;

  stringMetrics(text: string, size: number, letterSpacing?: number): PdfFontMetrics;

  /**
   * The text operand for a `Tj` operator — a literal string for a Type1 font, a
   * hex string of CIDs for a composite one. An embedded font also *records* the
   * code points it is asked for here, which is how the subset knows what to
   * contain.
   */
  encodeText(text: string): string;

  /**
   * The font's own dictionary, which the document wraps in an indirect object.
   *
   * Returns a `PdfDict` rather than a string as of roadmap phase 0.2, because an
   * embedded TTF needs to reference further objects — a font descriptor, a
   * `FontFile2` stream, a `/ToUnicode` CMap — and a reference can only be built
   * from a real object, not spliced into text. Phase 1.3 added the registry
   * argument for the same reason: those objects have to be created somewhere,
   * and the font is the only thing that knows how many it needs.
   *
   * Called once per document, after every page has been rendered.
   */
  resourceDict(document: PdfObjectRegistry): PdfDict;
}
