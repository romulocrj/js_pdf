/*
 * Ported to JavaScript from DavBfr/dart_pdf.
 *
 * Original work:
 * Copyright (C) 2017, David PHAM-VAN <dev.nfet.net@gmail.com>
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
 * Named destinations, outlines and outline page mode landed with the content
 * widgets in phase 3.8. Metadata, page labels, forms and PDF/A output intents
 * remain with their later consumers.
 */

import { PdfDict } from '../format/dict.ts';
import { PdfName } from '../format/name.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';
import type { PdfPageList } from './page_list.ts';
import type { PdfNames } from './names.ts';
import type { PdfOutline } from './outline.ts';

/** The document catalog: the `/Root` the trailer points at. */
export class PdfCatalog extends PdfObject<PdfDict> {
  readonly pageList: PdfPageList;
  names: PdfNames | null = null;
  outline: PdfOutline | null = null;
  showOutlines = false;

  constructor(document: PdfObjectRegistry, pageList: PdfPageList, objser?: number) {
    super(document, new PdfDict([['/Type', new PdfName('/Catalog')]]), objser);
    this.pageList = pageList;
  }

  override prepare(): void {
    this.params.set('/Pages', this.pageList.ref());
    if (this.names !== null) this.params.set('/Names', this.names.ref());
    if (this.outline !== null) this.params.set('/Outlines', this.outline.ref());
    if (this.showOutlines) this.params.set('/PageMode', new PdfName('/UseOutlines'));
  }
}
