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
 *   - pdf/lib/src/pdf/obj/page.dart
 *
 * PORT GAP: `/Resources` is still a hardcoded single-font dictionary, so a
 * document renders with one font. Per-page resource registration — `/Font`,
 * `/XObject`, `/ExtGState`, with automatic `/F1`, `/F2`, … naming — is roadmap
 * phase 0.3, and this is the class it lands in. Upstream splits that into the
 * `PdfGraphicStream` mixin.
 *
 * Also absent: `/Rotate` and `/Annots`. Annotations are phase 5.3.
 */

import { PdfArray } from '../format/array.ts';
import { PdfDict } from '../format/dict.ts';
import { PdfName } from '../format/name.ts';
import type { PdfObjectBase } from '../format/object_base.ts';
import type { PdfDataType } from '../format/base.ts';
import type { PageSize } from '../page_format.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';
import type { PdfPageList } from './page_list.ts';

/** One page object, holding its size and a reference to its content stream. */
export class PdfPage extends PdfObject<PdfDict> {
  readonly pageFormat: PageSize;
  readonly pageList: PdfPageList;
  readonly contents: PdfObjectBase<PdfDataType>[] = [];

  /** The single font this page's `/Resources` exposes as `/F1`. */
  readonly font: PdfObjectBase<PdfDataType>;

  constructor(
    document: PdfObjectRegistry,
    pageList: PdfPageList,
    pageFormat: PageSize,
    font: PdfObjectBase<PdfDataType>
  ) {
    super(document, new PdfDict([['/Type', new PdfName('/Page')]]));
    this.pageFormat = pageFormat;
    this.pageList = pageList;
    this.font = font;
    pageList.pages.push(this);
  }

  override prepare(): void {
    // Key order is part of the byte output: Parent, MediaBox, Resources,
    // Contents, after the /Type set in the constructor.
    this.params.set('/Parent', this.pageList.ref());
    this.params.set(
      '/MediaBox',
      PdfArray.fromNum([0, 0, this.pageFormat.width, this.pageFormat.height])
    );
    this.params.set(
      '/Resources',
      new PdfDict([['/Font', PdfDict.fromObjectMap([['/F1', this.font]])]])
    );

    // A lone content stream is referenced directly; several become an array.
    // Readers concatenate the array, so both forms describe the same page.
    if (this.contents.length === 1) {
      this.params.set('/Contents', this.contents[0]!.ref());
    } else if (this.contents.length > 1) {
      this.params.set('/Contents', PdfArray.fromObjects(this.contents));
    }
  }
}
