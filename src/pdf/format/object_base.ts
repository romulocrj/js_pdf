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
 *   - pdf/lib/src/pdf/format/object_base.dart
 *
 * Upstream carries a `PdfSettings` on every object, holding the deflate and
 * encrypt callbacks, a verbose flag and the target PDF version. The port has
 * none of those knobs — no compressor, encryption out of scope, one output
 * version — so the settings object is omitted rather than kept empty. That is
 * why `PdfDataType.output` takes only a stream; see `format/base.ts`.
 */

import type { PdfDataType } from './base.ts';
import { PdfIndirect } from './indirect.ts';
import type { PdfStream } from './stream.ts';

/**
 * An indirect object: a serial number plus the value it wraps.
 *
 * `params` is the wrapped value — a dictionary for most objects, a stream
 * dictionary for content. `prepare()` is the hook where an object fills in
 * entries that depend on the rest of the document, such as a page's `/Parent`;
 * it runs after every object exists, so forward references resolve.
 */
export class PdfObjectBase<T extends PdfDataType> {
  readonly objser: number;
  readonly objgen: number;
  readonly params: T;

  constructor(objser: number, params: T, objgen = 0) {
    this.objser = objser;
    this.objgen = objgen;
    this.params = params;
  }

  /** A reference to this object, for use as a dictionary or array value. */
  ref(): PdfIndirect {
    return new PdfIndirect(this.objser, this.objgen);
  }

  /** Called once before serialization, after all objects have been created. */
  prepare(): void {
    // Objects with no cross-object dependencies need nothing here.
  }

  /** Write `n g obj … endobj` and return the offset this object started at. */
  output(s: PdfStream): number {
    const offset = s.offset;
    s.putString(`${this.objser} ${this.objgen} obj\n`);
    this.writeContent(s);
    s.putString('endobj\n');
    return offset;
  }

  protected writeContent(s: PdfStream): void {
    this.params.output(s);
    s.putByte(0x0a);
  }
}
