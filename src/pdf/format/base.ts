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
 *   - pdf/lib/src/pdf/format/base.dart
 *
 * Upstream's signature is `output(PdfObjectBase o, PdfStream s, [int? indent])`.
 * The port drops both extra parameters:
 *
 *   - `o` exists to reach `PdfSettings` for stream compression and encryption.
 *     The port has neither — encryption is out of scope per docs/ROADMAP.md, and
 *     no deflate is available, so a value never needs to consult its object.
 *   - `indent` drives upstream's verbose pretty-printer, which the port does not
 *     reproduce.
 *
 * Dropping them keeps every `output` implementation a pure write of bytes.
 */

import { PdfStream } from './stream.ts';

/**
 * A value that can appear in PDF object syntax and knows how to serialize
 * itself. This is the seam that replaces the flat string building the port used
 * before roadmap phase 0.2.
 */
export abstract class PdfDataType {
  abstract output(s: PdfStream): void;

  /**
   * The serialized form as a Latin-1 string. For tests, diagnostics and the
   * font resource-dictionary seam — never used to build the file itself, which
   * always goes through a shared `PdfStream`.
   */
  toString(): string {
    const stream = new PdfStream();
    this.output(stream);
    let result = '';
    for (const byte of stream.output()) {
      result += String.fromCharCode(byte);
    }
    return result;
  }
}
