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
 *   - pdf/lib/src/pdf/obj/metadata.dart
 */

import { utf8Encode } from '../../base/utf8.ts';
import { PdfName } from '../format/name.ts';
import { PdfObjectStream } from './object_stream.ts';
import type { PdfObjectRegistry } from './object.ts';

/** An XML metadata packet attached to the document catalog. */
export class PdfMetadata extends PdfObjectStream {
  constructor(document: PdfObjectRegistry, metadata: string) {
    super(document, utf8Encode(metadata));
    this.params.set('/Type', new PdfName('/Metadata'));
    this.params.set('/Subtype', new PdfName('/XML'));
  }
}
