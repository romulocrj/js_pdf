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
 *   - pdf/lib/src/pdf/format/bool.dart
 */

import { PdfDataType } from './base.ts';
import type { PdfStream } from './stream.ts';

export class PdfBool extends PdfDataType {
  readonly value: boolean;

  constructor(value: boolean) {
    super();
    this.value = value;
  }

  override output(s: PdfStream): void {
    s.putString(this.value ? 'true' : 'false');
  }
}
