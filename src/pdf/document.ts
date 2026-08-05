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
 *   - pdf/lib/src/pdf/document.dart
 *
 * The flat object table this file used to hold became real indirect objects in
 * roadmap phase 0.2; the pieces now live under `format/` and `obj/`, and what is
 * left here is the registry that hands out serial numbers and owns the object
 * list.
 *
 * PORT GAP: no `PdfSettings`. Upstream threads compression, encryption, a
 * verbose mode and a target PDF version through every object. The port has one
 * output mode.
 */

import type { PdfDataType } from './format/base.ts';
import type { PdfObjectBase } from './format/object_base.ts';
import { PdfDict } from './format/dict.ts';
import { PdfStream, encodeLatin1 } from './format/stream.ts';
import { PdfXrefTable } from './format/xref.ts';
import type { PdfFont } from './font/font.ts';
import { defaultPdfFont } from './font/type1_fonts.ts';
import { PdfCatalog } from './obj/catalog.ts';
import { PdfInfo } from './obj/info.ts';
import type { DocumentMetadata } from './obj/info.ts';
import { PdfObject } from './obj/object.ts';
import { PdfObjectStream } from './obj/object_stream.ts';
import { PdfPage } from './obj/page.ts';
import { PdfPageList } from './obj/page_list.ts';
import type { PageSize } from './page_format.ts';

export type { DocumentMetadata } from './obj/info.ts';

/** One physical page, with its content stream already rendered to operators. */
export interface SerializedPage {
  readonly format: PageSize;
  readonly content: string;
}

/**
 * Owns the objects that make up a file, and writes them.
 *
 * Serial numbers are assigned in creation order, and objects are laid out in
 * serial order, so creation order is what determines the file layout. The
 * catalog is numbered first because it is the document's entry point; the page
 * list gets its serial next even though the catalog needs a reference to it,
 * which works because references are resolved in `prepare()`, after every object
 * exists.
 */
export class PdfDocument {
  private serial = 0;

  readonly xref = new PdfXrefTable();
  readonly pageList: PdfPageList;
  readonly catalog: PdfCatalog;
  readonly info: PdfInfo;

  /**
   * The document's single font object. Phase 0.3 replaces this with per-page
   * resource registration over a set of fonts.
   */
  readonly fontObject: PdfObject<PdfDict>;

  constructor(metadata: DocumentMetadata, font: PdfFont = defaultPdfFont) {
    const catalogSerial = this.genSerial();
    this.pageList = new PdfPageList(this);
    this.catalog = new PdfCatalog(this, this.pageList, catalogSerial);
    this.fontObject = new PdfObject(this, font.resourceDict());
    this.info = new PdfInfo(this, metadata);
  }

  get objects(): readonly PdfObjectBase<PdfDataType>[] {
    return this.xref.objects;
  }

  genSerial(): number {
    return ++this.serial;
  }

  register(object: PdfObjectBase<PdfDataType>): void {
    this.xref.add(object);
  }

  /**
   * Append a page. The content stream is created first so it is numbered before
   * the page that references it, keeping the file in dependency order.
   */
  addPage(format: PageSize, content: string): PdfPage {
    const stream = new PdfObjectStream(this, encodeLatin1(content));
    const page = new PdfPage(this, this.pageList, format, this.fontObject);
    page.contents.push(stream);
    return page;
  }

  save(): Uint8Array {
    for (const object of this.objects) {
      object.prepare();
    }

    this.xref.params.set('/Root', this.catalog.ref());
    this.xref.params.set('/Info', this.info.ref());

    const stream = new PdfStream();
    this.xref.output(stream);
    return stream.output();
  }
}

/** Build a document from already-rendered pages and write it. */
export function serializePdf(
  pages: readonly SerializedPage[],
  metadata: DocumentMetadata,
  font: PdfFont = defaultPdfFont
): Uint8Array {
  const document = new PdfDocument(metadata, font);

  for (const page of pages) {
    document.addPage(page.format, page.content);
  }

  return document.save();
}
