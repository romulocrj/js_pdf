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
 *   - pdf/lib/src/widgets/page.dart
 *   - pdf/lib/src/widgets/page_theme.dart
 */

import type { SerializedPage } from '../pdf/document.ts';
import type { ColorInput } from '../pdf/color.ts';
import { PdfCanvas } from '../pdf/graphics.ts';
import { DEFAULT_MARGIN, PageFormat } from '../pdf/page_format.ts';
import type { PageSize } from '../pdf/page_format.ts';
import { normalizeInsets } from './geometry.ts';
import type { Insets, InsetsInput } from './geometry.ts';
import type { AnyWidget, DocumentContext, RenderContext } from './widget.ts';

/** A `Page` or a `MultiPage`: anything a `Document` can render. */
export interface Section {
  render(documentContext: DocumentContext): SerializedPage[];
}

export interface PageOptions {
  readonly format?: PageSize;
  readonly margin?: InsetsInput;
  readonly build: (context: RenderContext) => AnyWidget;
  readonly background?: ColorInput | null;
}

/**
 * A single physical page. Content that does not fit is an error — use
 * `MultiPage` to paginate.
 */
export class Page implements Section {
  readonly format: PageSize;
  readonly margin: Insets;
  readonly build: (context: RenderContext) => AnyWidget;
  readonly background: ColorInput | null;

  constructor({
    format = PageFormat.A4,
    margin = DEFAULT_MARGIN,
    build,
    background = null
  }: PageOptions) {
    if (typeof build !== 'function') throw new TypeError('Page.build must be a function');
    this.format = { width: Number(format.width), height: Number(format.height) };
    this.margin = normalizeInsets(margin);
    this.build = build;
    this.background = background;
  }

  render(documentContext: DocumentContext): SerializedPage[] {
    const canvas = new PdfCanvas(this.format.height);
    if (this.background) canvas.fillRect(0, 0, this.format.width, this.format.height, this.background);

    const context: RenderContext = {
      ...documentContext,
      canvas,
      pageFormat: this.format,
      pageNumber: 1
    };

    const widget = this.build(context);
    const maxWidth = this.format.width - this.margin.left - this.margin.right;
    const maxHeight = this.format.height - this.margin.top - this.margin.bottom;
    const box = widget.layout(context, { maxWidth, maxHeight });

    if (box.height > maxHeight + 0.001) {
      throw new RangeError(`Page content height ${box.height.toFixed(2)} exceeds available height ${maxHeight.toFixed(2)}`);
    }

    widget.paint(context, { ...box, x: this.margin.left, y: this.margin.top });
    return [{ format: this.format, content: canvas.output() }];
  }
}
