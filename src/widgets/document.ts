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
import type {
  DocumentMetadata,
  PdfPageMode,
  SerializedOutline,
  SerializedPage
} from '../pdf/document.ts';
import type { Rgb } from '../pdf/color.ts';
import type { PdfOutlineStyle } from '../pdf/obj/outline.ts';
import type { PdfFont } from '../pdf/font/font.ts';
import { Font } from './font.ts';
import { MultiPage } from './multi_page.ts';
import { Page } from './page.ts';
import type { Section } from './page.ts';
import { ThemeData } from './theme.ts';

export interface DocumentOptions {
  readonly title?: string | null;
  readonly author?: string | null;
  readonly subject?: string | null;
  readonly creator?: string | null;
  readonly producer?: string | null;

  /** The styles pages inherit unless their own `PageTheme` names another. */
  readonly theme?: ThemeData;

  /**
   * The font a widget draws with when it names none of its own — the one-field
   * ancestor of `theme`, kept because it predates it. Setting it is the same as
   * passing `theme: ThemeData.withFont({ base: Font.fromPdfFont(font) })`, and
   * `theme` wins if both are given.
   */
  readonly font?: PdfFont;

  /** Open the viewer's outline pane when the file is opened. */
  readonly pageMode?: PdfPageMode;
}

export interface DocumentOutlineEntry {
  readonly title: string;
  readonly level: number;
  readonly anchor: string;
  page: number;
  y: number;
  readonly color: Rgb | null;
  readonly style: PdfOutlineStyle;
}

export class Document {
  readonly metadata: DocumentMetadata;
  readonly theme: ThemeData;
  readonly pageMode: PdfPageMode;
  readonly sections: Section[] = [];
  private readonly outlineEntries: DocumentOutlineEntry[] = [];
  private outlineReplay = false;
  private outlineCursor = 0;
  private outlineRerenderRequested = false;
  private renderPageOffset = 0;

  /**
   * One `PdfFont` per declaration, for this document only. An embedded font
   * accumulates the code points it is asked to encode, so the cache cannot be
   * global — two documents sharing a `Font` must not share its subset.
   */
  private readonly fonts = new Map<Font, PdfFont>();

  /** Used only if the theme's default style somehow names no font at all. */
  private readonly fallbackFont = Font.helvetica();

  constructor({
    title = null,
    author = null,
    subject = null,
    creator = 'js_pdf',
    producer = 'js_pdf',
    theme = undefined,
    font = undefined,
    pageMode = 'none'
  }: DocumentOptions = {}) {
    this.metadata = { title, author, subject, creator, producer };
    this.theme = theme
      ?? (font === undefined
        ? ThemeData.base()
        : ThemeData.withFont({ base: Font.fromPdfFont(font) }));
    this.pageMode = pageMode;
  }

  /** The `PdfFont` `declaration` stands for here, built once. */
  resolveFont(declaration: Font): PdfFont {
    const existing = this.fonts.get(declaration);
    if (existing !== undefined) {
      return existing;
    }

    const font = declaration.build();
    this.fonts.set(declaration, font);
    return font;
  }

  /**
   * The font a widget falls back to when neither it nor the theme resolved one.
   * Reads through the theme so a `Vector` and a `Text` on the same page agree,
   * and therefore share a single `/Font` entry.
   */
  get font(): PdfFont {
    return this.resolveFont(this.theme.defaultTextStyle.font ?? this.fallbackFont);
  }

  addPage(page: Section): this {
    if (!(page instanceof Page) && !(page instanceof MultiPage)) {
      throw new TypeError('Document.addPage expects Page or MultiPage');
    }
    this.sections.push(page);
    return this;
  }

  /** Current first-pass outline data, consumed by `TableOfContent`. */
  get outlines(): readonly DocumentOutlineEntry[] {
    return this.outlineEntries;
  }

  requestOutlineRerender(): void {
    this.outlineRerenderRequested = true;
  }

  registerOutline({
    title,
    level,
    pageNumber,
    y,
    color = null,
    style = 'normal'
  }: {
    readonly title: string;
    readonly level: number;
    readonly pageNumber: number;
    readonly y: number;
    readonly color?: Rgb | null;
    readonly style?: PdfOutlineStyle;
  }): void {
    const page = this.renderPageOffset + pageNumber;
    if (this.outlineReplay) {
      const existing = this.outlineEntries[this.outlineCursor];
      if (existing !== undefined) {
        existing.page = page;
        existing.y = y;
      } else {
        this.outlineEntries.push({
          title,
          level,
          anchor: `outline-${this.outlineCursor + 1}`,
          page,
          y,
          color,
          style
        });
      }
      this.outlineCursor++;
      return;
    }

    this.outlineEntries.push({
      title,
      level,
      anchor: `outline-${this.outlineEntries.length + 1}`,
      page,
      y,
      color,
      style
    });
  }

  private renderSections(replay: boolean): SerializedPage[] {
    this.outlineReplay = replay;
    this.outlineCursor = 0;
    const pages: SerializedPage[] = [];
    for (const section of this.sections) {
      this.renderPageOffset = pages.length;
      pages.push(...section.render({ document: this }));
    }
    return pages;
  }

  save(): Uint8Array {
    this.outlineEntries.length = 0;
    this.outlineRerenderRequested = false;
    let pages = this.renderSections(false);

    if (this.outlineRerenderRequested) {
      pages = this.renderSections(true);
    }

    if (pages.length === 0) {
      throw new Error('Document must contain at least one page');
    }

    const outlines: SerializedOutline[] = this.outlineEntries.map(entry => ({ ...entry }));
    return serializePdf(pages, this.metadata, outlines, this.pageMode);
  }
}
