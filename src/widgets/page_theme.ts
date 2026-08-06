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
 *   - pdf/lib/src/widgets/page_theme.dart
 *
 * Everything about a page except its content: the paper, the margins, the theme
 * its text inherits, and the widgets painted under and over the body.
 */

import { DEFAULT_MARGIN, formatMargin, PageFormat } from '../pdf/page_format.ts';
import type { PageSize } from '../pdf/page_format.ts';
import { normalizeInsets } from './geometry.ts';
import type { Insets, InsetsInput } from './geometry.ts';
import type { ThemeData } from './theme.ts';
import type { AnyWidget, RenderContext } from './widget.ts';

export type PageOrientation = 'natural' | 'landscape' | 'portrait';

export type BuildCallback = (context: RenderContext) => AnyWidget;

export interface PageThemeOptions {
  readonly pageFormat?: PageSize;
  readonly buildBackground?: BuildCallback | null;
  readonly buildForeground?: BuildCallback | null;
  readonly theme?: ThemeData | null;
  readonly orientation?: PageOrientation;
  readonly margin?: InsetsInput | null;

  /** Accepted for API parity; clipping needs the operators from phase 2.1. */
  readonly clip?: boolean;
}

export class PageTheme {
  readonly pageFormat: PageSize;
  readonly orientation: PageOrientation;
  readonly buildBackground: BuildCallback | null;
  readonly buildForeground: BuildCallback | null;
  readonly theme: ThemeData | null;
  readonly clip: boolean;

  private readonly declaredMargin: Insets | null;

  constructor({
    pageFormat = PageFormat.A4,
    buildBackground = null,
    buildForeground = null,
    theme = null,
    orientation = 'natural',
    margin = null,
    clip = false
  }: PageThemeOptions = {}) {
    // The margin fields ride along: a page with none of its own takes the
    // format's, the way `PdfPageFormat` carries them upstream.
    this.pageFormat = {
      ...pageFormat,
      width: Number(pageFormat.width),
      height: Number(pageFormat.height)
    };
    this.orientation = orientation;
    this.buildBackground = buildBackground;
    this.buildForeground = buildForeground;
    this.theme = theme;
    this.clip = clip;
    this.declaredMargin = margin == null ? null : normalizeInsets(margin);
  }

  /** Whether the requested orientation disagrees with the paper's own. */
  get mustRotate(): boolean {
    return (this.orientation === 'landscape' && this.pageFormat.height > this.pageFormat.width)
      || (this.orientation === 'portrait' && this.pageFormat.width > this.pageFormat.height);
  }

  /**
   * The paper as it is actually written.
   *
   * Upstream keeps the declared format and rotates the content stream through
   * the CTM, which the port cannot do until the transform operators land in
   * phase 2.1. Swapping the dimensions produces the same page for a reader; the
   * observable difference is `/MediaBox`, which reports the rotated size rather
   * than the original with rotated content inside it.
   */
  get resolvedFormat(): PageSize {
    return this.mustRotate
      ? { width: this.pageFormat.height, height: this.pageFormat.width }
      : this.pageFormat;
  }

  /**
   * Margins in the resolved orientation; rotated with the paper.
   *
   * A page states its own, or inherits the format's — `PageFormat.A4` carries
   * upstream's 2 cm, the same as `PdfPageFormat.a4`. The flat fallback is for
   * a bare `{ width, height }` format, which upstream cannot express.
   */
  get margin(): Insets {
    const fromFormat = formatMargin(this.pageFormat);
    const declared = this.declaredMargin
      ?? (fromFormat === null ? normalizeInsets(DEFAULT_MARGIN) : fromFormat);

    return this.mustRotate
      ? {
        left: declared.bottom,
        top: declared.left,
        right: declared.top,
        bottom: declared.right
      }
      : declared;
  }

  copyWith(options: PageThemeOptions = {}): PageTheme {
    return new PageTheme({
      pageFormat: options.pageFormat ?? this.pageFormat,
      buildBackground: options.buildBackground ?? this.buildBackground,
      buildForeground: options.buildForeground ?? this.buildForeground,
      theme: options.theme ?? this.theme,
      orientation: options.orientation ?? this.orientation,
      margin: options.margin ?? this.declaredMargin,
      clip: options.clip ?? this.clip
    });
  }
}
