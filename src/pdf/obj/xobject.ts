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
 *   - pdf/lib/src/pdf/obj/xobject.dart
 */

import { PdfName } from '../format/name.ts';
import { PdfObjectStream } from './object_stream.ts';
import type { PdfObjectRegistry } from './object.ts';

/** Binary or graphic stream that can be named from a page's `/XObject` map. */
export class PdfXObject extends PdfObjectStream {
  constructor(
    document: PdfObjectRegistry,
    subtype: string | null,
    data: Uint8Array = new Uint8Array(0),
    compress?: boolean
  ) {
    super(document, data, compress);
    this.params.set('/Type', new PdfName('/XObject'));
    if (subtype !== null) this.params.set('/Subtype', new PdfName(subtype));
  }

  get name(): string {
    return `/X${this.objser}`;
  }
}
