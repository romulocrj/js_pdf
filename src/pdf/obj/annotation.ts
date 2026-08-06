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
 *   - pdf/lib/src/pdf/obj/annotation.dart
 *
 * Only link annotations land in phase 5.3. Text notes, geometric annotations
 * and form fields remain with their own future consumers.
 */

import { PdfArray } from '../format/array.ts';
import { PdfDict } from '../format/dict.ts';
import { PdfName } from '../format/name.ts';
import { PdfNum } from '../format/num.ts';
import { PdfString } from '../format/string.ts';
import type { PdfRect } from '../rect.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';
import type { PdfPage } from './page.ts';

export interface PdfUrlLinkAnnotation {
  readonly kind: 'url';
  readonly rect: PdfRect;
  readonly destination: string;
}

export interface PdfNamedLinkAnnotation {
  readonly kind: 'destination';
  readonly rect: PdfRect;
  readonly destination: string;
}

export type PdfLinkAnnotation = PdfUrlLinkAnnotation | PdfNamedLinkAnnotation;

/** One invisible clickable rectangle in a page's `/Annots` array. */
export class PdfAnnotation extends PdfObject<PdfDict> {
  readonly page: PdfPage;
  readonly annotation: PdfLinkAnnotation;

  constructor(document: PdfObjectRegistry, page: PdfPage, annotation: PdfLinkAnnotation) {
    super(document, new PdfDict([['/Type', new PdfName('/Annot')]]));
    this.page = page;
    this.annotation = annotation;
    page.annotations.push(this);
  }

  override prepare(): void {
    const { rect, destination, kind } = this.annotation;
    this.params.set('/Subtype', new PdfName('/Link'));
    this.params.set('/Rect', PdfArray.fromNum([
      rect.x,
      rect.y,
      rect.x + rect.width,
      rect.y + rect.height
    ]));
    this.params.set('/P', this.page.ref());
    this.params.set('/Border', PdfArray.fromNum([0, 0, 0]));
    this.params.set('/F', new PdfNum(4));
    this.params.set('/A', new PdfDict([
      ['/S', new PdfName(kind === 'url' ? '/URI' : '/GoTo')],
      [kind === 'url' ? '/URI' : '/D', new PdfString(destination)]
    ]));
  }
}
