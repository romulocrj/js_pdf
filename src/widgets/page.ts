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
 *   - pdf/lib/src/widgets/page.dart
 */

import type { SerializedPage } from '../pdf/document.ts';
import type { ColorInput } from '../pdf/color.ts';
import { PdfCanvas } from '../pdf/graphics.ts';
import type { PageSize } from '../pdf/page_format.ts';
import { PageTheme } from './page_theme.ts';
import type { PageOrientation } from './page_theme.ts';
import type { AnyWidget, DocumentContext, RenderContext } from './widget.ts';
import type { InsetsInput } from './geometry.ts';
import { BoxConstraints } from './geometry.ts';
import type { ThemeData } from './theme.ts';

/**
 * A `Page` or a `MultiPage`: anything a `Document` can render.
 *
 * A section carries its own paper size and orientation, and every physical page
 * it produces is written with its own `/MediaBox`. **A document may therefore
 * mix orientations and paper sizes freely** — an A4 portrait cover, an A4
 * landscape table and a Letter appendix are three sections in one `save()`, with
 * no rotation flag and no post-processing. Nothing in the pipeline holds a
 * document-wide page size: `PdfPage` takes the format its section rendered at.
 */
export interface Section {
  render(documentContext: DocumentContext): SerializedPage[];
  postProcess?(documentContext: DocumentContext): SerializedPage[];
}

export interface PageOptions {
  /** Everything about the page but its body. Takes precedence field by field. */
  readonly pageTheme?: PageTheme;

  /** Upstream's name for the paper size. */
  readonly pageFormat?: PageSize;

  /** The port's original name for the same thing, kept for callers using it. */
  readonly format?: PageSize;

  readonly margin?: InsetsInput;
  readonly theme?: ThemeData;

  /**
   * `'portrait'` or `'landscape'` forces the paper's orientation; `'natural'`
   * takes the format as declared.
   *
   * Orientation is **per section**, so one document can mix them freely — see
   * the note on `Section`.
   */
  readonly orientation?: PageOrientation;

  readonly build: (context: RenderContext) => AnyWidget;
  readonly background?: ColorInput | null;
}

/**
 * A single physical page. Content that does not fit is an error — use
 * `MultiPage` to paginate.
 */
export class Page implements Section {
  readonly pageTheme: PageTheme;
  readonly build: (context: RenderContext) => AnyWidget;
  readonly background: ColorInput | null;

  constructor({
    pageTheme = undefined,
    pageFormat = undefined,
    format = undefined,
    margin = undefined,
    theme = undefined,
    orientation = undefined,
    build,
    background = null
  }: PageOptions) {
    if (typeof build !== 'function') throw new TypeError('Page.build must be a function');

    // The loose options are shorthand for a `PageTheme`, exactly as upstream:
    // whichever of them is given overrides the theme's corresponding field.
    const base = pageTheme ?? new PageTheme();
    this.pageTheme = base.copyWith({
      pageFormat: pageFormat ?? format,
      margin,
      theme,
      orientation
    });

    this.build = build;
    this.background = background;
  }

  get format(): PageSize {
    return this.pageTheme.resolvedFormat;
  }

  render(documentContext: DocumentContext): SerializedPage[] {
    const format = this.pageTheme.resolvedFormat;
    const margin = this.pageTheme.margin;

    const canvas = new PdfCanvas(format.height);
    if (this.background) canvas.fillRect(0, 0, format.width, format.height, this.background);

    const context: RenderContext = {
      ...documentContext,
      canvas,
      pageFormat: format,
      pageNumber: documentContext.pageOffset + 1,
      pageLabel: documentContext.document.pageLabel(documentContext.pageOffset),
      pagesCount: documentContext.pagesCount || documentContext.pageOffset + 1,
      theme: this.pageTheme.theme ?? documentContext.document.theme
    };

    const maxWidth = format.width - margin.left - margin.right;
    const maxHeight = format.height - margin.top - margin.bottom;

    // Background and foreground get the whole page, not the content area —
    // that is what makes a full-bleed watermark possible.
    this.paintLayer(this.pageTheme.buildBackground, context, format);

    const widget = this.build(context);
    const box = widget.layout(context, new BoxConstraints({ maxWidth, maxHeight }));

    if (box.height > maxHeight + 0.001) {
      throw new RangeError(`Page content height ${box.height.toFixed(2)} exceeds available height ${maxHeight.toFixed(2)}`);
    }

    widget.paint(context, { ...box, x: margin.left, y: margin.top });

    this.paintLayer(this.pageTheme.buildForeground, context, format);

    return [{
      format,
      content: canvas.takeOutputBytes(),
      fonts: canvas.fonts,
      graphicStates: canvas.graphicStates,
      patterns: canvas.patterns,
      shadings: canvas.shadings,
      images: canvas.images,
      annotations: canvas.annotations
    }];
  }

  private paintLayer(
    build: ((context: RenderContext) => AnyWidget) | null,
    context: RenderContext,
    format: PageSize
  ): void {
    if (build === null) {
      return;
    }

    const widget = build(context);
    const box = widget.layout(context, new BoxConstraints({
      maxWidth: format.width,
      maxHeight: format.height
    }));
    widget.paint(context, { ...box, x: 0, y: 0 });
  }
}
