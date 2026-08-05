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
 *   - pdf/lib/src/pdf/obj/page_list.dart
 *
 * PORT GAP: a flat page tree. Upstream is also flat in practice, but the PDF
 * spec allows intermediate `/Pages` nodes for large documents; neither builds
 * them.
 */

import { PdfArray } from '../format/array.ts';
import { PdfDict } from '../format/dict.ts';
import { PdfName } from '../format/name.ts';
import { PdfNum } from '../format/num.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';
import type { PdfPage } from './page.ts';

/** The `/Pages` object at the root of the page tree. */
export class PdfPageList extends PdfObject<PdfDict> {
  readonly pages: PdfPage[] = [];

  constructor(document: PdfObjectRegistry, objser?: number) {
    super(document, new PdfDict([['/Type', new PdfName('/Pages')]]), objser);
  }

  override prepare(): void {
    // `/Count` before `/Kids`: key order is part of the byte output.
    this.params.set('/Count', new PdfNum(this.pages.length));
    this.params.set('/Kids', PdfArray.fromObjects(this.pages));
  }
}
