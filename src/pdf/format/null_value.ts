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
 *   - pdf/lib/src/pdf/format/null_value.dart
 */

import { PdfDataType } from './base.ts';
import type { PdfStream } from './stream.ts';

/**
 * The PDF `null` object. Distinct from omitting a key: an explicit null
 * overrides an inherited value.
 */
export class PdfNull extends PdfDataType {
  override output(s: PdfStream): void {
    s.putString('null');
  }
}
