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
 *   - pdf/lib/src/pdf/obj/catalog.dart
 *
 * PORT GAP: `/Type` and `/Pages` only. Upstream also wires `/Outlines`,
 * `/Names`, `/Metadata`, `/PageLabels`, `/PageMode`, `/AcroForm` and the PDF/A
 * output intents. Those arrive with the features that need them — named
 * destinations in roadmap phase 3.8, annotations in 5.3, forms and metadata in
 * 5.6.
 */

import { PdfDict } from '../format/dict.ts';
import { PdfName } from '../format/name.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';
import type { PdfPageList } from './page_list.ts';

/** The document catalog: the `/Root` the trailer points at. */
export class PdfCatalog extends PdfObject<PdfDict> {
  readonly pageList: PdfPageList;

  constructor(document: PdfObjectRegistry, pageList: PdfPageList, objser?: number) {
    super(document, new PdfDict([['/Type', new PdfName('/Catalog')]]), objser);
    this.pageList = pageList;
  }

  override prepare(): void {
    this.params.set('/Pages', this.pageList.ref());
  }
}
