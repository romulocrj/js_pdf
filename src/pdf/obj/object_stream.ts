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
 *   - pdf/lib/src/pdf/obj/object_stream.dart
 */

import { PdfDictStream } from '../format/dict_stream.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';

/**
 * An indirect object holding a byte stream — a page's content operators today,
 * embedded font programs and image data later.
 *
 * The dictionary and the data are held apart until write time because `/Length`
 * is derived from the data; `PdfDictStream` joins them.
 */
export class PdfObjectStream extends PdfObject<PdfDictStream> {
  constructor(document: PdfObjectRegistry, data: Uint8Array) {
    super(document, new PdfDictStream(data));
  }
}
