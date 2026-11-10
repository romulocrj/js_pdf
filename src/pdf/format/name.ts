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
 *   - pdf/lib/src/pdf/format/name.dart
 *
 * Divergence: the port also escapes `)` (0x29). Upstream's escape list covers
 * `(` but omits its closing partner, so a name containing `)` serializes to
 * something a conformant reader would mis-parse — PDF 32000-1 §7.3.5 requires
 * every delimiter in a name to be hex-escaped. No name the port emits today
 * contains one, so this changes no output; it stops a future one from being
 * silently wrong.
 *
 * The escapes are over UTF-8 bytes, as upstream #1980 fixed: escaping UTF-16
 * code units wrote `/中` as `/#4e2d`, where `#` must take exactly two digits.
 */

import { utf8Encode } from '../../base/utf8.ts';
import { PdfDataType } from './base.ts';
import type { PdfStream } from './stream.ts';

/**
 * A PDF name object, such as `/Type` or `/WinAnsiEncoding`. The leading slash
 * is part of the value, matching upstream.
 */
export class PdfName extends PdfDataType {
  readonly value: string;

  constructor(value: string) {
    super();
    if (value.charCodeAt(0) !== 0x2f) {
      throw new TypeError(`PDF name must start with "/": ${value}`);
    }
    this.value = value;
  }

  override output(s: PdfStream): void {
    // ASCII is its own UTF-8, and nearly every name is ASCII: only the rest
    // pays for an encoded copy.
    const bytes = /[^\x00-\x7f]/.test(this.value) ? utf8Encode(this.value) : null;
    const length = bytes === null ? this.value.length : bytes.length;
    for (let index = 0; index < length; index++) {
      const code = bytes === null ? this.value.charCodeAt(index) : bytes[index]!;

      // Delimiters, whitespace and `#` itself have to be hex-escaped. A `/` is
      // literal only in the leading position.
      if (
        code < 0x21 ||
        code > 0x7e ||
        code === 0x23 ||
        (code === 0x2f && index > 0) ||
        code === 0x5b ||
        code === 0x5d ||
        code === 0x28 ||
        code === 0x29 ||
        code === 0x3c ||
        code === 0x3e
      ) {
        s.putString(`#${code.toString(16).padStart(2, '0')}`);
      } else {
        s.putByte(code);
      }
    }
  }
}
