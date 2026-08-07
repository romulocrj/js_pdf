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
 *   - pdf/lib/src/pdf/obj/page.dart
 *
 * `/Resources` is inherited from `PdfGraphicStream`, which is where per-page
 * `/Font`, `/XObject` and `/ExtGState` registration lives as of phase 0.3.
 *
 * DELIBERATE DIVERGENCE: there is no `/Rotate`; `PageTheme` swaps the physical
 * dimensions instead, so `/MediaBox` directly reports each section's resolved
 * orientation and one document may mix formats without rotating content.
 */

import { PdfArray } from '../format/array.ts';
import { PdfDict } from '../format/dict.ts';
import { PdfName } from '../format/name.ts';
import type { PdfObjectBase } from '../format/object_base.ts';
import type { PdfDataType } from '../format/base.ts';
import type { PageSize } from '../page_format.ts';
import { PdfGraphicStream } from './graphic_stream.ts';
import type { PdfObjectRegistry } from './object.ts';
import type { PdfPageList } from './page_list.ts';
import type { PdfAnnotation } from './annotation.ts';

/** One page object, holding its size and a reference to its content stream. */
export class PdfPage extends PdfGraphicStream {
  readonly pageFormat: PageSize;
  readonly pageList: PdfPageList;
  readonly contents: PdfObjectBase<PdfDataType>[] = [];
  readonly annotations: PdfAnnotation[] = [];

  constructor(
    document: PdfObjectRegistry,
    pageList: PdfPageList,
    pageFormat: PageSize
  ) {
    super(document, new PdfDict([['/Type', new PdfName('/Page')]]));
    this.pageFormat = pageFormat;
    this.pageList = pageList;
    pageList.pages.push(this);
  }

  override prepare(): void {
    // Key order is part of the byte output: Parent, MediaBox, Resources,
    // Contents, after the /Type set in the constructor. That is why the
    // inherited /Resources step runs here rather than first as upstream does.
    this.params.set('/Parent', this.pageList.ref());
    this.params.set(
      '/MediaBox',
      PdfArray.fromNum([0, 0, this.pageFormat.width, this.pageFormat.height])
    );
    super.prepare();

    // A lone content stream is referenced directly; several become an array.
    // Readers concatenate the array, so both forms describe the same page.
    if (this.contents.length === 1) {
      this.params.set('/Contents', this.contents[0]!.ref());
    } else if (this.contents.length > 1) {
      this.params.set('/Contents', PdfArray.fromObjects(this.contents));
    }
    if (this.annotations.length > 0) {
      this.params.set('/Annots', PdfArray.fromObjects(this.annotations));
    }
  }
}
