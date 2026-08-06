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
 *   - pdf/lib/src/pdf/obj/info.dart
 *
 * `/Producer` follows upstream: the port URL is the default, and is appended in
 * parentheses when the caller supplies an application name.
 */

import { PdfDict } from '../format/dict.ts';
import { PdfString } from '../format/string.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';

const LIBRARY_NAME = 'https://github.com/romulocrj/js_pdf';

export interface DocumentMetadata {
  readonly title?: string | null;
  readonly author?: string | null;
  readonly subject?: string | null;
  readonly creator?: string | null;
  readonly producer?: string | null;
  readonly keywords?: string | null;
  readonly xmpMetadata?: string | null;
}

/** The `/Info` dictionary the trailer points at. */
export class PdfInfo extends PdfObject<PdfDict> {
  constructor(document: PdfObjectRegistry, metadata: DocumentMetadata) {
    super(document, new PdfDict());

    const producer = metadata.producer == null
      ? LIBRARY_NAME
      : `${metadata.producer} (${LIBRARY_NAME})`;

    // Insertion order is emission order. Empty values are omitted rather than
    // written as empty strings, so an unset field is absent from the file.
    const entries: readonly (readonly [string, string | null | undefined])[] = [
      ['/Title', metadata.title],
      ['/Author', metadata.author],
      ['/Subject', metadata.subject],
      ['/Keywords', metadata.keywords],
      ['/Creator', metadata.creator],
      ['/Producer', producer]
    ];

    for (const [key, value] of entries) {
      if (value) {
        this.params.set(key, new PdfString(value));
      }
    }

    this.params.set('/CreationDate', PdfString.fromDate(new Date()));
  }
}
