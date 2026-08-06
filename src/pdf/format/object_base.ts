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
 * encrypt callbacks, a verbose flag and the target PDF version. The port keeps
 * only the knob it can act on — compression — because it ships its own
 * compressor rather than taking a callback; see `format/deflate.ts`. Encryption
 * is out of scope per docs/ROADMAP.md and there is one output version.
 *
 * The settings ride on the document rather than on every object, which is why
 * `PdfDataType.output` still takes only a stream; see `format/base.ts`. A
 * stream that needs them is handed them when it is constructed.
 */

import type { PdfDataType } from './base.ts';
import { PdfIndirect } from './indirect.ts';
import type { PdfStream } from './stream.ts';

/** Document-wide output options. */
export interface PdfSettings {
  /**
   * Deflate stream data, keeping the result only when it is actually smaller.
   *
   * On by default. Turning it off trades file size for generation time: the
   * compressor is written in JavaScript, so a document dominated by large
   * images pays real milliseconds for a very large saving.
   */
  readonly compress: boolean;
}

export const DEFAULT_PDF_SETTINGS: PdfSettings = { compress: true };

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
