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
 *   - pdf/lib/src/pdf/format/dict_stream.dart
 *
 * Compression follows upstream's rules exactly: data that already declares a
 * `/Filter` is written through untouched, and otherwise the deflated bytes are
 * kept only if they came out smaller than the original. Where upstream calls a
 * deflate callback the caller supplied, the port calls its own compressor —
 * bare V8 has none to borrow. See `format/deflate.ts`.
 *
 * SERIALIZATION CHOICE: no Ascii85. Upstream can wrap a binary stream in `/ASCII85Decode`
 * for hosts that need seven-bit output; the port always writes binary, which is
 * legal PDF and smaller. Encryption is out of scope per docs/ROADMAP.md.
 *
 * Layout differs from upstream in two places, both to keep phase 0.2's output
 * byte-identical to the string builder it replaced: the port writes a newline
 * between the dictionary and the `stream` keyword, and it writes one before
 * `endstream` only when the data does not already end with one. The second rule
 * is what the PDF spec wants anyway, and it generalizes to the binary streams
 * that TTF embedding and images will add.
 */

import type { PdfDataType } from './base.ts';
import { deflateZlib } from './deflate.ts';
import { PdfDict } from './dict.ts';
import { PdfName } from './name.ts';
import { PdfNum } from './num.ts';
import type { PdfStream } from './stream.ts';

/** A stream object: a dictionary describing bytes, followed by those bytes. */
export class PdfDictStream extends PdfDict {
  data: Uint8Array;

  /**
   * Whether this stream may be deflated. Off for data that is already
   * compressed — a JPEG carries its own `/DCTDecode` — where a second pass
   * would cost time and give nothing back.
   */
  readonly compress: boolean;

  constructor(
    data: Uint8Array = new Uint8Array(0),
    values?: Iterable<readonly [string, PdfDataType]>,
    compress = false
  ) {
    super(values);
    this.data = data;
    this.compress = compress;
  }

  override output(s: PdfStream): void {
    // Derived entries belong to this serialization only. Keeping them in a
    // separate dictionary makes repeated output byte-identical without
    // changing the caller-owned values or the original data.
    const params = new PdfDict(this.values);
    let data = this.data;
    if (this.compress && !params.has('/Filter')) {
      const deflated = deflateZlib(data);
      if (deflated.length < data.length) {
        params.set('/Filter', new PdfName('/FlateDecode'));
        data = deflated;
      }
    }

    // `/Length` is derived, so it is set at write time rather than by the
    // caller, and last — the key order is part of the output contract.
    params.set('/Length', new PdfNum(data.length));

    params.output(s);
    s.putString('\nstream\n');
    s.putBytes(data);
    if (data.length === 0 || data[data.length - 1] !== 0x0a) {
      s.putByte(0x0a);
    }
    s.putString('endstream');
  }
}
