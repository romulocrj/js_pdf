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
 *   - pdf/lib/src/pdf/format/indirect.dart
 */

import { PdfDataType } from './base.ts';
import type { PdfStream } from './stream.ts';

/**
 * A reference to an indirect object — `12 0 R`. Obtained from
 * `PdfObjectBase.ref()`, never constructed by hand, so a reference cannot name
 * an object the document does not own.
 */
export class PdfIndirect extends PdfDataType {
  readonly ser: number;
  readonly gen: number;

  constructor(ser: number, gen: number) {
    super();
    this.ser = ser;
    this.gen = gen;
  }

  equals(other: PdfIndirect): boolean {
    return this.ser === other.ser && this.gen === other.gen;
  }

  override output(s: PdfStream): void {
    s.putString(`${this.ser} ${this.gen} R`);
  }
}
