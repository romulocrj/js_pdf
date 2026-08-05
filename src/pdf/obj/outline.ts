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
 *   - pdf/lib/src/pdf/obj/outline.dart
 */

import type { Rgb } from '../color.ts';
import { PdfArray } from '../format/array.ts';
import { PdfDict } from '../format/dict.ts';
import { PdfNum } from '../format/num.ts';
import { PdfString } from '../format/string.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';

export type PdfOutlineStyle = 'normal' | 'italic' | 'bold' | 'italicBold';

const STYLE_NUMBER: Readonly<Record<PdfOutlineStyle, number>> = Object.freeze({
  normal: 0,
  italic: 1,
  bold: 2,
  italicBold: 3
});

/** One node, or the untitled root, of the document outline tree. */
export class PdfOutline extends PdfObject<PdfDict> {
  readonly title: string | null;
  readonly anchor: string | null;
  readonly color: Rgb | null;
  readonly style: PdfOutlineStyle;
  readonly children: PdfOutline[] = [];
  parent: PdfOutline | null = null;

  constructor(
    document: PdfObjectRegistry,
    {
      title = null,
      anchor = null,
      color = null,
      style = 'normal'
    }: {
      readonly title?: string | null;
      readonly anchor?: string | null;
      readonly color?: Rgb | null;
      readonly style?: PdfOutlineStyle;
    } = {}
  ) {
    super(document, new PdfDict());
    this.title = title;
    this.anchor = anchor;
    this.color = color;
    this.style = style;
  }

  add(child: PdfOutline): void {
    child.parent = this;
    this.children.push(child);
  }

  descendantCount(): number {
    return this.children.reduce((count, child) => count + 1 + child.descendantCount(), 0);
  }

  override prepare(): void {
    if (this.parent !== null) {
      this.params.set('/Title', new PdfString(this.title ?? ''));
      if (this.color !== null) this.params.set('/C', PdfArray.fromNum(this.color));
      if (this.style !== 'normal') this.params.set('/F', new PdfNum(STYLE_NUMBER[this.style]));
      if (this.anchor !== null) this.params.set('/Dest', new PdfString(this.anchor));
      this.params.set('/Parent', this.parent.ref());

      const index = this.parent.children.indexOf(this);
      if (index > 0) this.params.set('/Prev', this.parent.children[index - 1]!.ref());
      if (index + 1 < this.parent.children.length) {
        this.params.set('/Next', this.parent.children[index + 1]!.ref());
      }
      const descendants = this.descendantCount();
      if (descendants > 0) this.params.set('/Count', new PdfNum(-descendants));
    } else {
      // Nested nodes are closed by their negative /Count, so only the root's
      // direct children are initially visible.
      this.params.set('/Count', new PdfNum(this.children.length));
    }

    if (this.children.length > 0) {
      this.params.set('/First', this.children[0]!.ref());
      this.params.set('/Last', this.children[this.children.length - 1]!.ref());
    }
  }
}
