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
 *   - pdf/lib/src/widgets/multi_page.dart
 *
 * Spanning widgets return immutable continuation state with each fragment.
 * This is the pure-layout equivalent of upstream's mutable save/restore
 * context and keeps the same widget reusable after a page break.
 */

import type { ColorInput } from '../pdf/color.ts';
import type { SerializedPage } from '../pdf/document.ts';
import { PdfCanvas } from '../pdf/graphics.ts';
import { DEFAULT_MARGIN, PageFormat } from '../pdf/page_format.ts';
import type { PageSize } from '../pdf/page_format.ts';
import { BoxConstraints } from './geometry.ts';
import type { Insets, InsetsInput } from './geometry.ts';
import { PageTheme } from './page_theme.ts';
import type { PageOrientation } from './page_theme.ts';
import type { Section } from './page.ts';
import type { ThemeData } from './theme.ts';
import { SpanningWidget } from './widget.ts';
import type { AnyWidget, DocumentContext, RenderContext } from './widget.ts';

export interface MultiPageOptions {
  readonly format?: PageSize;

  /** Upstream's name for the same option. */
  readonly pageFormat?: PageSize;

  readonly margin?: InsetsInput;

  /**
   * `'portrait'` or `'landscape'` forces the paper's orientation for this
   * section only, so a landscape table can sit between portrait sections of the
   * same document. See the note on `Section` in `page.ts`.
   */
  readonly orientation?: PageOrientation;

  /** The styles this section's widgets inherit; defaults to the document's. */
  readonly theme?: ThemeData;
  readonly gap?: number;
  readonly build: (context: DocumentContext) => AnyWidget[];
  readonly header?: ((context: RenderContext) => AnyWidget) | null;
  readonly footer?: ((context: RenderContext) => AnyWidget) | null;
  readonly background?: ColorInput | null;
  readonly maxPages?: number;
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
  /**
   * Everything about the paper, so orientation resolves exactly as it does for
   * a `Page`: `format` and `margin` below are the *resolved* values, rotated
   * with the paper when the orientation disagrees with the declared format.
   */
  readonly pageTheme: PageTheme;
  readonly gap: number;
  readonly theme: ThemeData | null;
  readonly build: (context: DocumentContext) => AnyWidget[];
  readonly header: ((context: RenderContext) => AnyWidget) | null;
  readonly footer: ((context: RenderContext) => AnyWidget) | null;
  readonly background: ColorInput | null;
  readonly maxPages: number;

  constructor({
    format = undefined,
    pageFormat = undefined,
    margin = DEFAULT_MARGIN,
    orientation = 'natural',
    gap = 8,
    theme = undefined,
    build,
    header = null,
    footer = null,
    background = null,
    maxPages = 20
  }: MultiPageOptions) {
    if (typeof build !== 'function') throw new TypeError('MultiPage.build must be a function');
    this.pageTheme = new PageTheme({
      pageFormat: pageFormat ?? format ?? PageFormat.A4,
      margin,
      orientation
    });
    this.theme = theme ?? null;
    this.gap = Number(gap);
    this.build = build;
    this.header = header;
    this.footer = footer;
    this.background = background;
    this.maxPages = Math.trunc(Number(maxPages));
    if (!Number.isFinite(this.maxPages) || this.maxPages <= 0) {
      throw new RangeError('MultiPage.maxPages must be a positive finite integer');
    }
  }

  /** The paper as written, with the orientation applied. */
  get format(): PageSize {
    return this.pageTheme.resolvedFormat;
  }

  /** Margins in the resolved orientation, rotated with the paper. */
  get margin(): Insets {
    return this.pageTheme.margin;
  }

  render(documentContext: DocumentContext): SerializedPage[] {
    const children = this.build(documentContext);
    if (!Array.isArray(children)) throw new TypeError('MultiPage.build must return an array of widgets');

    const canvases: PdfCanvas[] = [];

    const startPage = (): PageState => {
      if (canvases.length >= this.maxPages) {
        throw new RangeError(`MultiPage exceeded its ${this.maxPages} page limit`);
      }
      const canvas = new PdfCanvas(this.format.height);
      if (this.background) canvas.fillRect(0, 0, this.format.width, this.format.height, this.background);

      const pageNumber = canvases.length + 1;
      const context: RenderContext = {
        ...documentContext,
        canvas,
        pageFormat: this.format,
        pageNumber,
        theme: this.theme ?? documentContext.document.theme
      };

      const maxWidth = this.format.width - this.margin.left - this.margin.right;
      let top = this.margin.top;
      let bottom = this.format.height - this.margin.bottom;

      if (this.header) {
        const headerWidget = this.header(context);
        const headerBox = headerWidget.layout(context, new BoxConstraints({
          maxWidth,
          maxHeight: bottom - top
        }));
        headerWidget.paint(context, { ...headerBox, x: this.margin.left, y: top });
        top += headerBox.height + this.gap;
      }

      if (this.footer) {
        const footerWidget = this.footer(context);
        const footerBox = footerWidget.layout(context, new BoxConstraints({
          maxWidth,
          maxHeight: bottom - top
        }));
        bottom -= footerBox.height + this.gap;
        footerWidget.paint(context, { ...footerBox, x: this.margin.left, y: bottom + this.gap });
      }

      canvases.push(canvas);
      return { canvas, context, maxWidth, top, bottom, cursor: top };
    };

    let page = startPage();

    for (const child of children) {
      if (child instanceof SpanningWidget && child.canSpan) {
        let state: unknown = child.initialSpanState();

        while (true) {
          const available = page.bottom - page.cursor;
          const fragment = child.layoutSpan(page.context, new BoxConstraints({
            maxWidth: page.maxWidth,
            maxHeight: available
          }), state);
          const box = fragment.box;

          if (box.height > available + 0.001) {
            throw new RangeError('A spanning widget returned a fragment taller than its constraint');
          }

          if (box.height <= 0.001 && fragment.hasMore) {
            if (page.cursor > page.top + 0.001) {
              page = startPage();
              continue;
            }
            throw new RangeError('A spanning row exceeds a full MultiPage content area');
          }

          if (box.height > 0) {
            child.paint(page.context, {
              ...box,
              x: this.margin.left,
              y: page.cursor
            });
          }

          if (!fragment.hasMore) {
            page.cursor += box.height + this.gap;
            break;
          }

          state = fragment.nextState;
          page = startPage();
        }
        continue;
      }

      let box = child.layout(page.context, new BoxConstraints({
        maxWidth: page.maxWidth,
        maxHeight: Infinity
      }));

      if (page.cursor + box.height > page.bottom + 0.001) {
        if (box.height > page.bottom - page.top + 0.001) {
          throw new RangeError(`Widget height ${box.height.toFixed(2)} exceeds a full MultiPage content area`);
        }

        page = startPage();
        box = child.layout(page.context, new BoxConstraints({
          maxWidth: page.maxWidth,
          maxHeight: Infinity
        }));
      }

      child.paint(page.context, {
        ...box,
        x: this.margin.left,
        y: page.cursor
      });
      page.cursor += box.height + this.gap;
    }

    return canvases.map(canvas => ({
      format: this.format,
      content: canvas.output(),
      fonts: canvas.fonts,
      graphicStates: canvas.graphicStates,
      patterns: canvas.patterns
    }));
  }
}
