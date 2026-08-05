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
 *   - pdf/lib/src/widgets/multi_page.dart
 *
 * PORT GAP: upstream defines a `SpanningWidget` protocol so a single widget
 * (a long `Table`, a long `Paragraph`) can be split across pages by saving and
 * restoring its layout context. This port has no spanning: a child that does
 * not fit an empty content area throws.
 */

import type { ColorInput } from '../pdf/color.ts';
import type { SerializedPage } from '../pdf/document.ts';
import { PdfCanvas } from '../pdf/graphics.ts';
import { DEFAULT_MARGIN, PageFormat } from '../pdf/page_format.ts';
import type { PageSize } from '../pdf/page_format.ts';
import { normalizeInsets } from './geometry.ts';
import type { Insets, InsetsInput } from './geometry.ts';
import type { Section } from './page.ts';
import type { AnyWidget, DocumentContext, RenderContext } from './widget.ts';

export interface MultiPageOptions {
  readonly format?: PageSize;
  readonly margin?: InsetsInput;
  readonly gap?: number;
  readonly build: (context: DocumentContext) => AnyWidget[];
  readonly header?: ((context: RenderContext) => AnyWidget) | null;
  readonly footer?: ((context: RenderContext) => AnyWidget) | null;
  readonly background?: ColorInput | null;
}

/** Mutable per-page state while the section is being filled. */
interface PageState {
  readonly canvas: PdfCanvas;
  readonly context: RenderContext;
  readonly maxWidth: number;
  readonly top: number;
  readonly bottom: number;
  cursor: number;
}

export class MultiPage implements Section {
  readonly format: PageSize;
  readonly margin: Insets;
  readonly gap: number;
  readonly build: (context: DocumentContext) => AnyWidget[];
  readonly header: ((context: RenderContext) => AnyWidget) | null;
  readonly footer: ((context: RenderContext) => AnyWidget) | null;
  readonly background: ColorInput | null;

  constructor({
    format = PageFormat.A4,
    margin = DEFAULT_MARGIN,
    gap = 8,
    build,
    header = null,
    footer = null,
    background = null
  }: MultiPageOptions) {
    if (typeof build !== 'function') throw new TypeError('MultiPage.build must be a function');
    this.format = { width: Number(format.width), height: Number(format.height) };
    this.margin = normalizeInsets(margin);
    this.gap = Number(gap);
    this.build = build;
    this.header = header;
    this.footer = footer;
    this.background = background;
  }

  render(documentContext: DocumentContext): SerializedPage[] {
    const children = this.build(documentContext);
    if (!Array.isArray(children)) throw new TypeError('MultiPage.build must return an array of widgets');

    const canvases: PdfCanvas[] = [];

    const startPage = (): PageState => {
      const canvas = new PdfCanvas(this.format.height);
      if (this.background) canvas.fillRect(0, 0, this.format.width, this.format.height, this.background);

      const pageNumber = canvases.length + 1;
      const context: RenderContext = {
        ...documentContext,
        canvas,
        pageFormat: this.format,
        pageNumber
      };

      const maxWidth = this.format.width - this.margin.left - this.margin.right;
      let top = this.margin.top;
      let bottom = this.format.height - this.margin.bottom;

      if (this.header) {
        const headerWidget = this.header(context);
        const headerBox = headerWidget.layout(context, { maxWidth, maxHeight: bottom - top });
        headerWidget.paint(context, { ...headerBox, x: this.margin.left, y: top });
        top += headerBox.height + this.gap;
      }

      if (this.footer) {
        const footerWidget = this.footer(context);
        const footerBox = footerWidget.layout(context, { maxWidth, maxHeight: bottom - top });
        bottom -= footerBox.height + this.gap;
        footerWidget.paint(context, { ...footerBox, x: this.margin.left, y: bottom + this.gap });
      }

      canvases.push(canvas);
      return { canvas, context, maxWidth, top, bottom, cursor: top };
    };

    let page = startPage();

    for (const child of children) {
      let box = child.layout(page.context, {
        maxWidth: page.maxWidth,
        maxHeight: page.bottom - page.cursor
      });

      if (page.cursor + box.height > page.bottom + 0.001) {
        if (box.height > page.bottom - page.top + 0.001) {
          throw new RangeError(`Widget height ${box.height.toFixed(2)} exceeds a full MultiPage content area`);
        }

        page = startPage();
        box = child.layout(page.context, {
          maxWidth: page.maxWidth,
          maxHeight: page.bottom - page.cursor
        });
      }

      child.paint(page.context, {
        ...box,
        x: this.margin.left,
        y: page.cursor
      });
      page.cursor += box.height + this.gap;
    }

    return canvases.map(canvas => ({ format: this.format, content: canvas.output() }));
  }
}
