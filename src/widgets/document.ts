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
 *
 * Port additions: `creationDate`, and `pdfa`, which replaces attaching
 * `PdfaColorProfile` and `PdfaAttachedFiles` to `pdf.document` as upstream's
 * PDF/A README does - here every save builds a fresh `PdfDocument`, so there
 * is nothing long-lived to attach them to. The options are checked here, so a
 * bad profile or an unsupported part fails at construction.
 */

import { writePdf } from '../pdf/document.ts';
import { PdfStream } from '../pdf/format/stream.ts';
import type {
  DocumentMetadata,
  PdfPageMode,
  SerializedDestination,
  SerializedOutline,
  SerializedPage,
  SerializedPageLabel
} from '../pdf/document.ts';
import type { PdfaSettings, PdfSettings } from '../pdf/format/object_base.ts';
import { iccProfileInfo } from '../pdf/obj/pdfa/pdfa_color_profile.ts';
import { PdfaAttachedFile } from '../pdf/obj/pdfa/pdfa_attached_files.ts';
import type { PdfaAttachedFileOptions } from '../pdf/obj/pdfa/pdfa_attached_files.ts';
import type { Rgb } from '../pdf/color.ts';
import type { PdfOutlineStyle } from '../pdf/obj/outline.ts';
import type { PdfFont } from '../pdf/font/font.ts';
import { PdfPageLabel } from '../pdf/obj/page_label.ts';
import { Font } from './font.ts';
import { MultiPage } from './multi_page.ts';
import { Page } from './page.ts';
import type { Section } from './page.ts';
import { ThemeData } from './theme.ts';

/** Bounds the `TableOfContent` replays; numbers settle after two in practice. */
const MAX_OUTLINE_REPLAYS = 4;

/** `Document({ pdfa })`: see AI_USAGE.md, "PDF/A". */
export interface DocumentPdfaOptions {
  /** 2 or 3, by default 3. Part 1 forbids transparency and is rejected. */
  readonly part?: 2 | 3;
  /** `'B'` (default) or `'U'`; level A needs a structure tree the port does not write. */
  readonly conformance?: 'B' | 'U';
  /** The output intent's ICC profile, such as sRGB2014.icc; RGB, CMYK or gray. */
  readonly colorProfile: Uint8Array;
  /** `/OutputConditionIdentifier`, by default `Custom`. */
  readonly outputCondition?: string;
  /** Embedded files, PDF/A-3 only. */
  readonly attachments?: readonly PdfaAttachedFileOptions[];
  /** RDF added to the generated XMP packet, such as `new PdfaFacturxRdf().create()`. */
  readonly extensionRdf?: string;
}

function pdfaSettings(
  { part = 3, conformance = 'B', colorProfile, outputCondition, attachments = [], extensionRdf }: DocumentPdfaOptions,
  xmpMetadata: string | null
): PdfaSettings {
  if (part === (1 as number)) {
    throw new RangeError('PDF/A-1 is unsupported: it forbids transparency, which js_pdf paints (alpha, soft masks); use part 2 or 3');
  }
  if (part !== 2 && part !== 3) throw new RangeError(`PDF/A part must be 2 or 3, not ${String(part)}`);
  if (conformance === ('A' as string)) {
    throw new RangeError("PDF/A level A needs a structure tree, which js_pdf does not write; use 'B' or 'U'");
  }
  if (conformance !== 'B' && conformance !== 'U') throw new RangeError(`PDF/A conformance must be 'B' or 'U', not ${String(conformance)}`);
  if (colorProfile === undefined) {
    throw new TypeError('PDF/A needs pdfa.colorProfile, the ICC profile bytes, e.g. sRGB2014.icc');
  }
  if ([outputCondition, extensionRdf].some(value => value !== undefined && typeof value !== 'string')) {
    throw new TypeError('pdfa.outputCondition and pdfa.extensionRdf must be strings');
  }
  iccProfileInfo(colorProfile);
  if (xmpMetadata) {
    throw new TypeError('Pass xmpMetadata or pdfa, not both: PDF/A writes its own XMP; add RDF with pdfa.extensionRdf');
  }
  if (attachments.length > 0 && part !== 3) {
    throw new RangeError('PDF/A-2 attachments must be PDF/A files, which js_pdf cannot verify; use part 3');
  }
  return {
    part, conformance, colorProfile, outputCondition, extensionRdf,
    attachments: attachments.map(file => (file instanceof PdfaAttachedFile ? file : new PdfaAttachedFile(file)))
  };
}

export interface DocumentOptions {
  readonly title?: string | null;
  readonly author?: string | null;
  readonly subject?: string | null;
  readonly creator?: string | null;
  /** The port URL is used by default and appended to caller-supplied values. */
  readonly producer?: string | null;
  readonly keywords?: string | null;
  /** Caller-supplied XMP packet, serialized as UTF-8 XML metadata. Not with `pdfa`. */
  readonly xmpMetadata?: string | null;
  /** `/CreationDate` (and, under PDF/A, the XMP dates); the time of `save()` by default. */
  readonly creationDate?: Date | null;
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

  /**
   * Deflate the document's streams. On by default, and worth leaving on: an
   * embedded image is raw samples, so the saving is usually an order of
   * magnitude. Turn it off to trade file size back for generation time.
   */
  readonly compress?: boolean;
  /** Select full-program WinAnsi for lazy TrueType declarations. */
  readonly simpleTrueTypeFonts?: boolean;
  /**
   * Paint a color's alpha. On by default, as upstream; `false` ignores color
   * alpha. `Opacity` and other opacity states still paint.
   */
  readonly colorAlpha?: boolean;
  /**
   * Write PDF/A-2 or PDF/A-3, level B or U: an output intent, an XMP packet
   * matching `/Info`, a trailer `/ID` and any attachments. `save()` throws on
   * what PDF/A forbids and the port can see: a standard Type1 font, device
   * colour the profile does not describe. Not verified with veraPDF.
   */
  readonly pdfa?: DocumentPdfaOptions | null;
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
  readonly settings: PdfSettings;
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
    creationDate = null,
    pageLabels = [],
    theme = undefined,
    font = undefined,
    pageMode = 'none',
    compress = true,
    simpleTrueTypeFonts = false,
    colorAlpha = true,
    pdfa = null
  }: DocumentOptions = {}) {
    if (creationDate !== null && !(creationDate instanceof Date && Number.isFinite(creationDate.getTime()))) {
      throw new TypeError('Document creationDate must be a valid Date');
    }
    this.metadata = { title, author, subject, creator, producer, keywords, xmpMetadata, creationDate };
    this.settings = pdfa === null
      ? { compress, simpleTrueTypeFonts, colorAlpha }
      : { compress, simpleTrueTypeFonts, colorAlpha, pdfa: pdfaSettings(pdfa, xmpMetadata) };
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

    const font = declaration.build(this.settings.simpleTrueTypeFonts);
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
    const index = this.outlineReplay ? this.outlineCursor++ : this.outlineEntries.length;
    const existing = this.outlineEntries[index];
    if (this.outlineReplay && existing !== undefined) {
      existing.page = page;
      existing.y = y;
      return;
    }

    this.outlineEntries.push({
      title,
      level,
      // The reserved prefix upstream #1980 gives generated anchors: the old
      // `outline-N` collided with a user `Anchor` of the same name.
      anchor: anchor ?? `__dest${index}`,
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

  private outlinePages(): string {
    return this.outlineEntries.map(entry => entry.page).join();
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
    const output = new PdfStream();
    this.write(output);
    return output.output();
  }

  /** Render and serialize to a caller-owned destination without collecting the PDF. */
  write(output: PdfStream): void {
    this.outlineEntries.length = 0;
    this.outlineRerenderRequested = false;
    let pages = this.renderSections(false);

    // A TableOfContent that shares the flow with what it lists moves that
    // content by its own height, so the numbers it printed from the previous
    // pass go stale; one replay left most rows wrong. Replay until a pass
    // finds every outline where the previous one did, which is when the
    // printed numbers are the real ones. Usually that is the second replay.
    for (let replay = 0; this.outlineRerenderRequested && replay < MAX_OUTLINE_REPLAYS; replay++) {
      const before = this.outlinePages();
      pages = this.renderSections(true, pages.length);
      this.outlineEntries.length = this.outlineCursor;
      if (this.outlinePages() === before) break;
    }

    if (pages.length === 0) {
      throw new Error('Document must contain at least one page');
    }

    const outlines: SerializedOutline[] = this.outlineEntries.map(entry => ({ ...entry }));
    const destinations: SerializedDestination[] = this.destinationEntries.map(entry => ({ ...entry }));
    const pageLabels: SerializedPageLabel[] = [...this.pageLabelEntries]
      .sort(([a], [b]) => a - b)
      .map(([pageIndex, label]) => ({ pageIndex, label }));
    writePdf(
      output, pages, this.metadata, outlines, this.pageMode, destinations, pageLabels, this.settings
    );
  }
}
