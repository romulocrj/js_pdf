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
 *   - pdf/lib/src/pdf/obj/info.dart
 *
 * PORT GAP: no `/CreationDate` and no `/Keywords`. Upstream stamps the current
 * time, which the port cannot do — reading a clock is a host capability the
 * library does not have, and a document that varies run to run cannot be
 * asserted byte for byte. A caller that wants a creation date can pass it once
 * the string type grows a PDF-date branch in roadmap phase 1.3.
 *
 * Upstream also appends its own URL to `/Producer`; the port leaves the caller's
 * value alone.
 */

import { PdfDict } from '../format/dict.ts';
import { PdfString } from '../format/string.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';

export interface DocumentMetadata {
  readonly title?: string | null;
  readonly author?: string | null;
  readonly subject?: string | null;
  readonly creator?: string | null;
  readonly producer?: string | null;
}

/** The `/Info` dictionary the trailer points at. */
export class PdfInfo extends PdfObject<PdfDict> {
  constructor(document: PdfObjectRegistry, metadata: DocumentMetadata) {
    super(document, new PdfDict());

    // Insertion order is emission order. Empty values are omitted rather than
    // written as empty strings, so an unset field is absent from the file.
    const entries: readonly (readonly [string, string | null | undefined])[] = [
      ['/Title', metadata.title],
      ['/Author', metadata.author],
      ['/Subject', metadata.subject],
      ['/Creator', metadata.creator],
      ['/Producer', metadata.producer]
    ];

    for (const [key, value] of entries) {
      if (value) {
        this.params.set(key, new PdfString(value));
      }
    }
  }
}
