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
 *   - pdf/lib/src/pdf/document.dart
 *
 * The flat object table this file used to hold became real indirect objects in
 * roadmap phase 0.2; the pieces now live under `format/` and `obj/`, and what is
 * left here is the registry that hands out serial numbers and owns the object
 * list.
 *
 * PORT GAP: no `PdfSettings`. Upstream threads compression, encryption, a
 * verbose mode and a target PDF version through every object. The port has one
 * output mode.
 */

import type { PdfDataType } from './format/base.ts';
import type { PdfObjectBase } from './format/object_base.ts';
import { PdfDict } from './format/dict.ts';
import { PdfStream, encodeLatin1 } from './format/stream.ts';
import { PdfXrefTable } from './format/xref.ts';
import type { PdfFont } from './font/font.ts';
import { PdfCatalog } from './obj/catalog.ts';
import { PdfInfo } from './obj/info.ts';
import type { DocumentMetadata } from './obj/info.ts';
import { PdfObject } from './obj/object.ts';
import { PdfObjectStream } from './obj/object_stream.ts';
import { PdfPage } from './obj/page.ts';
import { PdfPageList } from './obj/page_list.ts';
import { PdfNames } from './obj/names.ts';
import { PdfOutline } from './obj/outline.ts';
import type { PdfOutlineStyle } from './obj/outline.ts';
import type { PageSize } from './page_format.ts';
import type { Rgb } from './color.ts';
import { PdfImageObject } from './obj/image.ts';
import type { PdfImage } from './obj/image.ts';

export type { DocumentMetadata } from './obj/info.ts';

/** One physical page, with its content stream already rendered to operators. */
export interface SerializedPage {
  readonly format: PageSize;
  readonly content: string;

  /**
   * The fonts `content` drew with, mapped to the `/F…` names it wrote for them.
   * `PdfCanvas` chose the names; this is what turns them into `/Resources`.
   */
  readonly fonts: ReadonlyMap<PdfFont, string>;

  /** The `/ExtGState` dictionaries `content` selected, by the name it wrote. */
  readonly graphicStates?: ReadonlyMap<string, PdfDict>;

  /** The direct shading-pattern dictionaries `content` selected. */
  readonly patterns?: ReadonlyMap<string, PdfDict>;

  /** The image resources `content` selected, by their page-local names. */
  readonly images?: ReadonlyMap<PdfImage, string>;
}

export interface SerializedOutline {
  readonly title: string;
  readonly level: number;
  readonly anchor: string;
  /** One-based physical page number. */
  readonly page: number;
  /** Destination coordinate in PDF bottom-left space. */
  readonly y: number;
  readonly color?: Rgb | null;
  readonly style?: PdfOutlineStyle;
}

export type PdfPageMode = 'none' | 'outlines';

/**
 * Owns the objects that make up a file, and writes them.
 *
 * Serial numbers are assigned in creation order, and objects are laid out in
 * serial order, so creation order is what determines the file layout. The
 * catalog is numbered first because it is the document's entry point; the page
 * list gets its serial next even though the catalog needs a reference to it,
 * which works because references are resolved in `prepare()`, after every object
 * exists.
 */
export class PdfDocument {
  private serial = 0;

  readonly xref = new PdfXrefTable();
  readonly pageList: PdfPageList;
  readonly catalog: PdfCatalog;
  readonly info: PdfInfo;

  /**
   * One indirect object per distinct font, created on first use. Keyed by
   * identity, matching upstream: two `PdfType1Font.helvetica()` instances are
   * two fonts, and phase 1 will need that — two subsets of the same TTF are not
   * interchangeable either.
   */
  private readonly fontObjects = new Map<PdfFont, PdfObject<PdfDict>>();
  private readonly imageObjects = new Map<PdfImage, PdfImageObject>();

  constructor(metadata: DocumentMetadata) {
    const catalogSerial = this.genSerial();
    this.pageList = new PdfPageList(this);
    this.catalog = new PdfCatalog(this, this.pageList, catalogSerial);
    this.info = new PdfInfo(this, metadata);
  }

  get objects(): readonly PdfObjectBase<PdfDataType>[] {
    return this.xref.objects;
  }

  genSerial(): number {
    return ++this.serial;
  }

  register(object: PdfObjectBase<PdfDataType>): void {
    this.xref.add(object);
  }

  /**
   * The indirect object holding `font`'s dictionary, created once per document.
   *
   * An embedded font builds its subset, descriptor and `/ToUnicode` CMap inside
   * `resourceDict`, so this must not run until every page has been rendered —
   * which is exactly when `addPage` is called.
   */
  fontObject(font: PdfFont): PdfObject<PdfDict> {
    const existing = this.fontObjects.get(font);
    if (existing !== undefined) {
      return existing;
    }

    const object = new PdfObject(this, font.resourceDict(this));
    this.fontObjects.set(font, object);
    return object;
  }

  imageObject(image: PdfImage): PdfImageObject {
    const existing = this.imageObjects.get(image);
    if (existing !== undefined) return existing;
    const mask = image.hasAlpha ? new PdfImageObject(this, image, 'alpha') : null;
    const object = new PdfImageObject(this, image, 'rgb');
    if (mask !== null) object.setSoftMask(mask);
    this.imageObjects.set(image, object);
    return object;
  }

  /**
   * Append a page. Its fonts and content stream are created first so they are
   * numbered before the page that references them, keeping the file in
   * dependency order.
   *
   * `fonts` maps each font the content stream drew with to the resource name it
   * wrote for that font — see `PdfCanvas.addFont`. A page that drew no text
   * passes nothing and gets no `/Resources` at all, as upstream does.
   */
  addPage(
    format: PageSize,
    content: string,
    fonts: ReadonlyMap<PdfFont, string> = new Map(),
    graphicStates: ReadonlyMap<string, PdfDict> = new Map(),
    patterns: ReadonlyMap<string, PdfDict> = new Map(),
    images: ReadonlyMap<PdfImage, string> = new Map()
  ): PdfPage {
    const resources: [string, PdfObject<PdfDict>][] = [];
    for (const [font, name] of fonts) {
      resources.push([name, this.fontObject(font)]);
    }

    const stream = new PdfObjectStream(this, encodeLatin1(content));
    const page = new PdfPage(this, this.pageList, format);

    for (const [name, object] of resources) {
      page.addFont(name, object);
    }

    for (const [name, state] of graphicStates) {
      page.addGraphicState(name, state);
    }

    for (const [name, pattern] of patterns) {
      page.addPattern(name, pattern);
    }

    for (const [image, name] of images) {
      page.addXObject(name, this.imageObject(image));
    }

    page.contents.push(stream);
    return page;
  }

  addNavigation(outlines: readonly SerializedOutline[], pageMode: PdfPageMode): void {
    if (outlines.length === 0) {
      this.catalog.showOutlines = pageMode === 'outlines';
      return;
    }

    const names = new PdfNames(this);
    const root = new PdfOutline(this);
    const levels: PdfOutline[] = [root];

    for (const entry of outlines) {
      const page = this.pageList.pages[entry.page - 1];
      if (page === undefined) continue;
      names.addDestination(entry.anchor, page, { y: entry.y });
      const node = new PdfOutline(this, {
        title: entry.title,
        anchor: entry.anchor,
        color: entry.color ?? null,
        style: entry.style ?? 'normal'
      });
      const parentIndex = Math.min(entry.level, levels.length - 1);
      const parent = levels[parentIndex] ?? root;
      parent.add(node);
      levels.length = parentIndex + 1;
      levels.push(node);
    }

    this.catalog.names = names;
    this.catalog.outline = root;
    this.catalog.showOutlines = pageMode === 'outlines';
  }

  save(): Uint8Array {
    for (const object of this.objects) {
      object.prepare();
    }

    this.xref.params.set('/Root', this.catalog.ref());
    this.xref.params.set('/Info', this.info.ref());

    const stream = new PdfStream();
    this.xref.output(stream);
    return stream.output();
  }
}

/** Build a document from already-rendered pages and write it. */
export function serializePdf(
  pages: readonly SerializedPage[],
  metadata: DocumentMetadata,
  outlines: readonly SerializedOutline[] = [],
  pageMode: PdfPageMode = 'none'
): Uint8Array {
  const document = new PdfDocument(metadata);

  for (const page of pages) {
    document.addPage(page.format, page.content, page.fonts, page.graphicStates, page.patterns, page.images);
  }

  document.addNavigation(outlines, pageMode);

  return document.save();
}
