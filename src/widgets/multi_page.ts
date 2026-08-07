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
 *   - pdf/lib/src/widgets/multi_page.dart
 *
 * Spanning widgets return immutable continuation state with each fragment.
 * This is the pure-layout equivalent of upstream's mutable save/restore
 * context and keeps the same widget reusable after a page break.
 */

import type { ColorInput } from '../pdf/color.ts';
import type { SerializedPage } from '../pdf/document.ts';
import { PdfCanvas } from '../pdf/graphics.ts';
import { PageFormat } from '../pdf/page_format.ts';
import type { PageSize } from '../pdf/page_format.ts';
import { Flex } from './flex.ts';
import { BoxConstraints } from './geometry.ts';
import type { Insets, InsetsInput } from './geometry.ts';
import { PageTheme } from './page_theme.ts';
import type { PageOrientation } from './page_theme.ts';
import type { Section } from './page.ts';
import type { ThemeData } from './theme.ts';
import { SpanningWidget, Widget } from './widget.ts';
import type {
  AnyWidget,
  Constraints,
  DocumentContext,
  LayoutBox,
  PositionedBox,
  RenderContext
} from './widget.ts';

export interface NewPageOptions {
  readonly freeSpace?: number | null;
}

/** Triggers a page break, optionally only below a remaining-space threshold. */
export class NewPage extends Widget<null> {
  readonly freeSpace: number | null;

  constructor({ freeSpace = null }: NewPageOptions = {}) {
    super();
    if (freeSpace === null) {
      this.freeSpace = null;
      return;
    }
    const resolved = Number(freeSpace);
    if (!Number.isFinite(resolved) || resolved < 0) {
      throw new RangeError('NewPage.freeSpace must be a finite non-negative number');
    }
    this.freeSpace = resolved;
  }

  newPageNeeded(availableSpace: number): boolean {
    return this.freeSpace === null || availableSpace < this.freeSpace;
  }

  override layout(_context: RenderContext, _constraints: Constraints): LayoutBox<null> {
    return { widget: this, width: 0, height: 0, data: null };
  }

  override paint(_context: RenderContext, _box: PositionedBox<null>): void {}
}

export interface MultiPageOptions {
  /** Everything about each physical page but its body. */
  readonly pageTheme?: PageTheme;

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
  readonly build: (context: RenderContext) => AnyWidget[];
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
  readonly build: (context: RenderContext) => AnyWidget[];
  readonly header: ((context: RenderContext) => AnyWidget) | null;
  readonly footer: ((context: RenderContext) => AnyWidget) | null;
  readonly background: ColorInput | null;
  readonly maxPages: number;
  private renderedPages: PageState[] = [];

  constructor({
    pageTheme = undefined,
    format = undefined,
    pageFormat = undefined,
    margin = undefined,
    orientation = undefined,
    gap = 0,
    theme = undefined,
    build,
    header = null,
    footer = null,
    background = null,
    maxPages = 50
  }: MultiPageOptions) {
    if (typeof build !== 'function') throw new TypeError('MultiPage.build must be a function');
    const base = pageTheme ?? new PageTheme({ pageFormat: PageFormat.A4 });
    this.pageTheme = base.copyWith({
      pageFormat: pageFormat ?? format,
      margin,
      orientation,
      theme
    });
    this.theme = this.pageTheme.theme;
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
    const pages: PageState[] = [];

    const startPage = (): PageState => {
      if (pages.length >= this.maxPages) {
        throw new RangeError(`MultiPage exceeded its ${this.maxPages} page limit`);
      }
      const canvas = new PdfCanvas(this.format.height);
      if (this.background) canvas.fillRect(0, 0, this.format.width, this.format.height, this.background);

      const pageNumber = documentContext.pageOffset + pages.length + 1;
      const context: RenderContext = {
        ...documentContext,
        canvas,
        pageFormat: this.format,
        pageNumber,
        pageLabel: documentContext.document.pageLabel(pageNumber - 1),
        pagesCount: documentContext.pagesCount || pageNumber,
        theme: this.theme ?? documentContext.document.theme
      };

      this.paintLayer(this.pageTheme.buildBackground, context);

      const maxWidth = this.format.width - this.margin.left - this.margin.right;
      let top = this.margin.top;
      let bottom = this.format.height - this.margin.bottom;

      if (this.header) {
        const headerWidget = this.header(context);
        const headerBox = headerWidget.layout(context, new BoxConstraints({
          maxWidth
        }));
        top += headerBox.height + this.gap;
      }

      if (this.footer) {
        const footerWidget = this.footer(context);
        const footerBox = footerWidget.layout(context, new BoxConstraints({
          maxWidth
        }));
        bottom -= footerBox.height + this.gap;
      }

      const state = { canvas, context, maxWidth, top, bottom, cursor: top };
      pages.push(state);
      return state;
    };

    let page = startPage();
    const children = this.build(page.context);
    if (!Array.isArray(children)) throw new TypeError('MultiPage.build must return an array of widgets');

    for (const child of children) {
      if (child instanceof NewPage) {
        if (child.newPageNeeded(page.bottom - page.cursor)) page = startPage();
        continue;
      }

      if (child instanceof SpanningWidget && child.canSpan) {
        let state: unknown = child.initialSpanState();
        const natural = child.layout(page.context, new BoxConstraints({
          maxWidth: page.maxWidth,
          maxHeight: Infinity
        }));
        const initialAvailable = page.bottom - page.cursor;

        if (natural.height <= initialAvailable + 0.001) {
          child.paint(page.context, {
            ...natural,
            x: this.margin.left,
            y: page.cursor
          });
          page.cursor += natural.height + this.gap;
          continue;
        }

        const fullAvailable = page.bottom - page.top;
        /*
         * A vertical flex with `mainAxisSize: max` expands only after it is
         * given a finite fragment. If its intrinsic form fits a fresh page,
         * keep it together instead of turning a tiny tail fragment into a
         * page-filling continuation.
         */
        if (child instanceof Flex
            && natural.height <= fullAvailable + 0.001
            && page.cursor > page.top + 0.001) {
          page = startPage();
          const moved = child.layout(page.context, new BoxConstraints({
            maxWidth: page.maxWidth,
            maxHeight: Infinity
          }));
          child.paint(page.context, {
            ...moved,
            x: this.margin.left,
            y: page.cursor
          });
          page.cursor += moved.height + this.gap;
          continue;
        }

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

    this.renderedPages = pages;

    return this.serialize(pages);
  }

  postProcess(documentContext: DocumentContext): SerializedPage[] {
    for (const state of this.renderedPages) {
      const context: RenderContext = {
        ...state.context,
        ...documentContext,
        pagesCount: documentContext.pagesCount
      };

      if (this.header) {
        const headerWidget = this.header(context);
        const headerBox = headerWidget.layout(context, new BoxConstraints({
          maxWidth: state.maxWidth
        }));
        headerWidget.paint(context, {
          ...headerBox,
          x: this.margin.left,
          y: this.margin.top
        });
      }

      if (this.footer) {
        const footerWidget = this.footer(context);
        const footerBox = footerWidget.layout(context, new BoxConstraints({
          maxWidth: state.maxWidth
        }));
        footerWidget.paint(context, {
          ...footerBox,
          x: this.margin.left,
          y: this.format.height - this.margin.bottom - footerBox.height
        });
      }

      this.paintLayer(this.pageTheme.buildForeground, context);
    }

    return this.serialize(this.renderedPages);
  }

  private serialize(pages: readonly PageState[]): SerializedPage[] {
    return pages.map(({ canvas }) => ({
      format: this.format,
      content: canvas.output(),
      fonts: canvas.fonts,
      graphicStates: canvas.graphicStates,
      patterns: canvas.patterns,
      images: canvas.images,
      annotations: canvas.annotations
    }));
  }

  private paintLayer(
    build: ((context: RenderContext) => AnyWidget) | null,
    context: RenderContext
  ): void {
    if (build === null) return;
    const widget = build(context);
    const box = widget.layout(context, new BoxConstraints({
      maxWidth: this.format.width,
      maxHeight: this.format.height
    }));
    widget.paint(context, { ...box, x: 0, y: 0 });
  }
}
