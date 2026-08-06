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
 *   - pdf/lib/src/widgets/document.dart
 *   - pdf/lib/src/widgets/annotations.dart
 *
 * `save()` is synchronous here. Upstream returns a `Future<Uint8List>` because
 * it may await image decoding and font loading; the port keeps every stage
 * synchronous so a host such as ClearScript can call it without an event loop.
 */

import { serializePdf } from '../pdf/document.ts';
import type {
  DocumentMetadata,
  PdfPageMode,
  SerializedDestination,
  SerializedOutline,
  SerializedPage,
  SerializedPageLabel
} from '../pdf/document.ts';
import type { Rgb } from '../pdf/color.ts';
import type { PdfOutlineStyle } from '../pdf/obj/outline.ts';
import type { PdfFont } from '../pdf/font/font.ts';
import { PdfPageLabel } from '../pdf/obj/page_label.ts';
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
  /** The port URL is used by default and appended to caller-supplied values. */
  readonly producer?: string | null;
  readonly keywords?: string | null;
  /** Caller-supplied XMP packet, serialized as UTF-8 XML metadata. */
  readonly xmpMetadata?: string | null;
  readonly pageLabels?: readonly SerializedPageLabel[];

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

export interface DocumentDestinationEntry {
  readonly name: string;
  readonly page: number;
  readonly x: number | null;
  readonly y: number | null;
  readonly zoom: number | null;
}

export class Document {
  readonly metadata: DocumentMetadata;
  readonly theme: ThemeData;
  readonly pageMode: PdfPageMode;
  readonly sections: Section[] = [];
  private readonly outlineEntries: DocumentOutlineEntry[] = [];
  private readonly destinationEntries: DocumentDestinationEntry[] = [];
  private readonly pageLabelEntries = new Map<number, PdfPageLabel>();
  private outlineReplay = false;
  private outlineCursor = 0;
  private outlineRerenderRequested = false;

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
    creator = null,
    producer = null,
    keywords = null,
    xmpMetadata = null,
    pageLabels = [],
    theme = undefined,
    font = undefined,
    pageMode = 'none'
  }: DocumentOptions = {}) {
    this.metadata = { title, author, subject, creator, producer, keywords, xmpMetadata };
    for (const { pageIndex, label } of pageLabels) this.setPageLabel(pageIndex, label);
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

  /** Begin a page-label numbering range at a zero-based physical page index. */
  setPageLabel(pageIndex: number, label: PdfPageLabel): this {
    if (!Number.isInteger(pageIndex) || pageIndex < 0) {
      throw new RangeError('Page label index must be a non-negative integer');
    }
    if (!(label instanceof PdfPageLabel)) {
      throw new TypeError('Document.setPageLabel expects a PdfPageLabel');
    }
    this.pageLabelEntries.set(pageIndex, label);
    return this;
  }

  pageLabel(pageIndex: number): string {
    const keys = [...this.pageLabelEntries.keys()].sort((a, b) => a - b);
    let current = PdfPageLabel.arabic();
    let start = 0;
    for (const key of keys) {
      if (pageIndex < key) break;
      current = this.pageLabelEntries.get(key) ?? current;
      start = key;
    }
    return current.asString(pageIndex - start);
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
    anchor = null,
    color = null,
    style = 'normal'
  }: {
    readonly title: string;
    readonly level: number;
    readonly pageNumber: number;
    readonly y: number;
    readonly anchor?: string | null;
    readonly color?: Rgb | null;
    readonly style?: PdfOutlineStyle;
  }): void {
    const page = pageNumber;
    if (this.outlineReplay) {
      const existing = this.outlineEntries[this.outlineCursor];
      if (existing !== undefined) {
        existing.page = page;
        existing.y = y;
      } else {
        this.outlineEntries.push({
          title,
          level,
          anchor: anchor ?? `outline-${this.outlineCursor + 1}`,
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
      anchor: anchor ?? `outline-${this.outlineEntries.length + 1}`,
      page,
      y,
      color,
      style
    });
  }

  registerDestination({
    name,
    pageNumber,
    x = null,
    y = null,
    zoom = null
  }: {
    readonly name: string;
    readonly pageNumber: number;
    readonly x?: number | null;
    readonly y?: number | null;
    readonly zoom?: number | null;
  }): void {
    this.destinationEntries.push({
      name,
      page: pageNumber,
      x,
      y,
      zoom
    });
  }

  private renderSections(replay: boolean, expectedPagesCount = 0): SerializedPage[] {
    this.outlineReplay = replay;
    this.outlineCursor = 0;
    this.destinationEntries.length = 0;
    const pages: SerializedPage[] = [];
    const rendered: Array<{
      readonly section: Section;
      readonly pageOffset: number;
      readonly pages: SerializedPage[];
    }> = [];
    for (const section of this.sections) {
      const pageOffset = pages.length;
      const sectionPages = section.render({
        document: this,
        pageOffset,
        pagesCount: expectedPagesCount
      });
      rendered.push({ section, pageOffset, pages: sectionPages });
      pages.push(...sectionPages);
    }

    const pagesCount = pages.length;
    const processed: SerializedPage[] = [];
    for (const entry of rendered) {
      processed.push(...(entry.section.postProcess?.({
        document: this,
        pageOffset: entry.pageOffset,
        pagesCount
      }) ?? entry.pages));
    }
    return processed;
  }

  save(): Uint8Array {
    this.outlineEntries.length = 0;
    this.outlineRerenderRequested = false;
    let pages = this.renderSections(false);

    if (this.outlineRerenderRequested) {
      pages = this.renderSections(true, pages.length);
    }

    if (pages.length === 0) {
      throw new Error('Document must contain at least one page');
    }

    const outlines: SerializedOutline[] = this.outlineEntries.map(entry => ({ ...entry }));
    const destinations: SerializedDestination[] = this.destinationEntries.map(entry => ({ ...entry }));
    const pageLabels: SerializedPageLabel[] = [...this.pageLabelEntries]
      .sort(([a], [b]) => a - b)
      .map(([pageIndex, label]) => ({ pageIndex, label }));
    return serializePdf(pages, this.metadata, outlines, this.pageMode, destinations, pageLabels);
  }
}
