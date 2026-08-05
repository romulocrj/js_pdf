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
 *   - pdf/lib/src/widgets/document.dart
 *
 * `save()` is synchronous here. Upstream returns a `Future<Uint8List>` because
 * it may await image decoding and font loading; the port keeps every stage
 * synchronous so a host such as ClearScript can call it without an event loop.
 */

import { serializePdf } from '../pdf/document.ts';
import type { DocumentMetadata, SerializedPage } from '../pdf/document.ts';
import type { PdfFont } from '../pdf/font/font.ts';
import { defaultPdfFont } from '../pdf/font/type1_fonts.ts';
import { MultiPage } from './multi_page.ts';
import { Page } from './page.ts';
import type { Section } from './page.ts';
import type { DocumentContext } from './widget.ts';

export interface DocumentOptions {
  readonly title?: string | null;
  readonly author?: string | null;
  readonly subject?: string | null;
  readonly creator?: string | null;
  readonly producer?: string | null;

  /**
   * The font a widget draws with when it names none of its own. As of phase 0.3
   * this is a default rather than the document's only font — each page registers
   * whatever its content stream actually used. Phase 1.4 replaces it with
   * `ThemeData`, of which this is the one-field ancestor.
   */
  readonly font?: PdfFont;
}

export class Document {
  readonly metadata: DocumentMetadata;
  readonly font: PdfFont;
  readonly sections: Section[] = [];

  constructor({
    title = null,
    author = null,
    subject = null,
    creator = 'js_pdf',
    producer = 'js_pdf',
    font = defaultPdfFont
  }: DocumentOptions = {}) {
    this.metadata = { title, author, subject, creator, producer };
    this.font = font;
  }

  addPage(page: Section): this {
    if (!(page instanceof Page) && !(page instanceof MultiPage)) {
      throw new TypeError('Document.addPage expects Page or MultiPage');
    }
    this.sections.push(page);
    return this;
  }

  save(): Uint8Array {
    const documentContext: DocumentContext = { document: this };
    const pages: SerializedPage[] = [];

    for (const section of this.sections) {
      pages.push(...section.render(documentContext));
    }

    if (pages.length === 0) {
      throw new Error('Document must contain at least one page');
    }

    return serializePdf(pages, this.metadata);
  }
}
