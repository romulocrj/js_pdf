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
 *   - pdf/lib/src/pdf/format/dict_stream.dart
 *
 * PORT GAP: no `/Filter`. Upstream deflates through a caller-supplied callback
 * and can Ascii85-encode binary streams; the port has no compressor of its own
 * and takes no callbacks, so stream data is always stored verbatim. Encryption
 * is out of scope per docs/ROADMAP.md.
 *
 * Layout differs from upstream in two places, both to keep phase 0.2's output
 * byte-identical to the string builder it replaced: the port writes a newline
 * between the dictionary and the `stream` keyword, and it writes one before
 * `endstream` only when the data does not already end with one. The second rule
 * is what the PDF spec wants anyway, and it generalizes to the binary streams
 * that TTF embedding and images will add.
 */

import type { PdfDataType } from './base.ts';
import { PdfDict } from './dict.ts';
import { PdfNum } from './num.ts';
import type { PdfStream } from './stream.ts';

/** A stream object: a dictionary describing bytes, followed by those bytes. */
export class PdfDictStream extends PdfDict {
  data: Uint8Array;

  constructor(
    data: Uint8Array = new Uint8Array(0),
    values?: Iterable<readonly [string, PdfDataType]>
  ) {
    super(values);
    this.data = data;
  }

  override output(s: PdfStream): void {
    // `/Length` is derived, so it is set at write time rather than by the
    // caller, and last — the key order is part of the output contract.
    this.set('/Length', new PdfNum(this.data.length));

    super.output(s);
    s.putString('\nstream\n');
    s.putBytes(this.data);
    if (this.data.length === 0 || this.data[this.data.length - 1] !== 0x0a) {
      s.putByte(0x0a);
    }
    s.putString('endstream');
  }
}
