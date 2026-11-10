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
 *   - pdf/lib/src/pdf/document.dart
 *
 * The flat object table this file used to hold became real indirect objects in
 * roadmap phase 0.2; the pieces now live under `format/` and `obj/`, and what is
 * left here is the registry that hands out serial numbers and owns the object
 * list.
 *
 * SCOPE AND ARCHITECTURE: `PdfSettings` carries compression and simple-font selection. Encryption
 * is explicitly outside this port's host-free runtime, verbose in-file
 * diagnostics are replaced by a caller-installed sink, and the writer emits
 * one fixed, broadly compatible PDF version rather than branching by version.
 *
 * PDF/A (phase 6.11) is a setting rather than objects a caller attaches,
 * because the widget `Document` builds a fresh `PdfDocument` on every save.
 * With `settings.pdfa` the document adds the XMP packet, the output intent and
 * any attachments, checks what can be checked cheaply, and writes `/ID`.
 * Upstream writes `/ID` for every file, from the clock and random bytes; the
 * port writes it only under PDF/A, so other output is unchanged, and derives
 * it from the content, since it has no random source.
 */

import { PdfDataType } from './format/base.ts';
import type { PdfObjectBase, PdfSettings } from './format/object_base.ts';
import { DEFAULT_PDF_SETTINGS } from './format/object_base.ts';
import { PdfDict } from './format/dict.ts';
import { PdfArray } from './format/array.ts';
import { PdfNum } from './format/num.ts';
import { PdfName } from './format/name.ts';
import { PdfString } from './format/string.ts';
import { PdfStream, encodeLatin1 } from './format/stream.ts';
import { PdfDictStream } from './format/dict_stream.ts';
import { PdfXrefTable } from './format/xref.ts';
import type { PdfFont } from './font/font.ts';
import { PdfCatalog } from './obj/catalog.ts';
import { PdfInfo, pdfProducer } from './obj/info.ts';
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
import { PdfAnnotation } from './obj/annotation.ts';
import type { PdfAnnotationSpec } from './obj/annotation.ts';
import type {
  PdfFormAppearance,
  PdfFormAppearances,
  PdfResolvedFormAppearances
} from './obj/annotation.ts';
import { PdfMetadata } from './obj/metadata.ts';
import { PdfPageLabels } from './obj/page_label.ts';
import type { PdfPageLabel } from './obj/page_label.ts';
import type { PdfFormXObject } from './obj/formxobject.ts';
import { PdfXObject } from './obj/xobject.ts';
import { PdfSoftMaskReference } from './soft_mask.ts';
import type { PdfSoftMask } from './soft_mask.ts';
import { PdfaRdf, pdfaClean } from './obj/pdfa/pdfa_rdf.ts';
import { PdfaColorProfile } from './obj/pdfa/pdfa_color_profile.ts';
import type { PdfaColorSpace } from './obj/pdfa/pdfa_color_profile.ts';
import { PdfaAttachedFiles } from './obj/pdfa/pdfa_attached_files.ts';

export type { DocumentMetadata } from './obj/info.ts';

/** One physical page, with its content stream already rendered to operators. */
export interface SerializedPage {
  readonly format: PageSize;
  readonly content: Uint8Array;

  /**
   * The fonts `content` drew with, mapped to the `/F…` names it wrote for them.
   * `PdfCanvas` chose the names; this is what turns them into `/Resources`.
   */
  readonly fonts: ReadonlyMap<PdfFont, string>;

  /** The `/ExtGState` dictionaries `content` selected, by the name it wrote. */
  readonly graphicStates?: ReadonlyMap<string, PdfDict>;

  /** The direct shading-pattern dictionaries `content` selected. */
  readonly patterns?: ReadonlyMap<string, PdfDict>;

  /** The direct shading dictionaries selected by an `sh` operator. */
  readonly shadings?: ReadonlyMap<string, PdfDict>;

  /** The image resources `content` selected, by their page-local names. */
  readonly images?: ReadonlyMap<PdfImage, string>;

  /** Link and form annotations registered while the page was painted. */
  readonly annotations?: readonly PdfAnnotationSpec[];
  readonly forms?: ReadonlyMap<PdfFormXObject, string>;
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

export interface SerializedDestination {
  readonly name: string;
  /** One-based physical page number. */
  readonly page: number;
  readonly x?: number | null;
  readonly y?: number | null;
  readonly zoom?: number | null;
}

export type PdfPageMode = 'none' | 'outlines';

export interface SerializedPageLabel {
  /** Zero-based physical page index where this numbering style begins. */
  readonly pageIndex: number;
  readonly label: PdfPageLabel;
}

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
  private readonly formObjects = new Map<PdfFormXObject, PdfXObject>();
  private readonly softMaskObjects = new Map<PdfSoftMask, PdfXObject>();
  private readonly formFontNames = new Map<PdfFont, string>();
  private readonly formFieldKids = new Map<string, PdfAnnotation[]>();

  readonly settings: PdfSettings;

  constructor(metadata: DocumentMetadata, settings: PdfSettings = DEFAULT_PDF_SETTINGS) {
    this.settings = settings;
    const catalogSerial = this.genSerial();
    this.pageList = new PdfPageList(this);
    this.catalog = new PdfCatalog(this, this.pageList, catalogSerial);
    const pdfa = settings.pdfa;
    if (pdfa === undefined) {
      this.info = new PdfInfo(this, metadata);
      if (metadata.xmpMetadata) {
        this.catalog.metadata = new PdfMetadata(this, metadata.xmpMetadata);
      }
      return;
    }

    // `/Info` and the XMP packet must agree (ISO 19005-2 6.6.2.3.1), so both
    // take one clock read, and every value loses the characters XML cannot
    // hold before either is written. Upstream reads the clock twice and
    // writes its library URL into `/Producer` but not into `pdf:Producer`.
    const date = metadata.creationDate ?? new Date();
    const clean = (value: string | null | undefined): string | null => (value ? pdfaClean(value) || null : null);
    const info: DocumentMetadata = {
      title: clean(metadata.title), author: clean(metadata.author), subject: clean(metadata.subject),
      keywords: clean(metadata.keywords), creator: clean(metadata.creator),
      producer: metadata.producer == null ? null : pdfaClean(metadata.producer), creationDate: date
    };
    this.info = new PdfInfo(this, info, true);
    this.catalog.metadata = new PdfMetadata(this, new PdfaRdf({
      ...info, producer: pdfProducer(info.producer), modificationDate: date,
      part: pdfa.part, conformance: pdfa.conformance, invoiceRdf: pdfa.extensionRdf
    }).create());
    new PdfaColorProfile(this, pdfa.colorProfile, pdfa.outputCondition);
    if (pdfa.attachments !== undefined && pdfa.attachments.length > 0) {
      const names = new PdfNames(this);
      names.embeddedFiles = new PdfaAttachedFiles(this, pdfa.attachments, date).names;
      this.catalog.names = names;
    }
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

    const dict = font.resourceDict(this);
    const pdfa = this.settings.pdfa;
    // A standard Type1 font has neither a descriptor nor a descendant: it is
    // never embedded, which PDF/A forbids (ISO 19005-2 6.2.11.4.1).
    if (pdfa !== undefined && !dict.has('/FontDescriptor') && !dict.has('/DescendantFonts')) {
      throw new TypeError(`PDF/A needs embedded fonts; ${font.fontName} is a standard Type1 font, never embedded. Make TrueType `
        + 'faces the theme: new Document({ theme: ThemeData.withFont({ base: Font.ttf(regular), bold: Font.ttf(bold) }), pdfa })');
    }
    if (pdfa?.conformance === 'U' && (font as { readonly protect?: boolean }).protect === true) {
      throw new TypeError(`PDF/A-${pdfa.part}U needs extractable text; ${font.fontName} has protect: true`);
    }
    const object = new PdfObject(this, dict);
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

  private softMaskObject(mask: PdfSoftMask): PdfDict {
    let object = this.softMaskObjects.get(mask);
    if (object === undefined) {
      object = new PdfXObject(this, '/Form', mask.content);
      object.params.set('/FormType', new PdfNum(1));
      object.params.set('/BBox', PdfArray.fromNum([
        mask.boundingBox.x,
        mask.boundingBox.y,
        mask.boundingBox.x + mask.boundingBox.width,
        mask.boundingBox.y + mask.boundingBox.height
      ]));
      object.params.set('/Group', new PdfDict([
        ['/S', new PdfName('/Transparency')],
        ['/CS', new PdfName('/DeviceRGB')]
      ]));
      const resources = new PdfDict();
      if (mask.fonts.size > 0) {
        const fonts = new Map<string, PdfObject<PdfDict>>();
        for (const [font, name] of mask.fonts) fonts.set(name, this.fontObject(font));
        resources.set('/Font', PdfDict.fromObjectMap(fonts));
      }
      if (mask.images.size > 0) {
        const images = new Map<string, PdfImageObject>();
        for (const [image, name] of mask.images) images.set(name, this.imageObject(image));
        resources.set('/XObject', PdfDict.fromObjectMap(images));
      }
      if (mask.graphicStates.size > 0) {
        resources.set('/ExtGState', new PdfDict(
          Array.from(mask.graphicStates, ([name, state]) => [name, this.resolveGraphicState(state)])
        ));
      }
      if (mask.patterns.size > 0) resources.set('/Pattern', new PdfDict(mask.patterns));
      if (mask.shadings.size > 0) resources.set('/Shading', new PdfDict(mask.shadings));
      if (!resources.isEmpty) object.params.set('/Resources', resources);
      this.softMaskObjects.set(mask, object);
    }
    return new PdfDict([
      ['/S', new PdfName('/Luminosity')],
      ['/G', object.ref()]
    ]);
  }

  private resolveGraphicState(state: PdfDict): PdfDict {
    const softMask = state.get('/SMask');
    if (!(softMask instanceof PdfSoftMaskReference)) return state;
    const resolved = new PdfDict(state.values);
    resolved.set('/SMask', this.softMaskObject(softMask.mask));
    return resolved;
  }

  private formObject(form: PdfFormXObject): PdfXObject {
    let object = this.formObjects.get(form);
    if (object === undefined) {
      object = this.formAppearanceObject(form.appearance);
      this.formObjects.set(form, object);
    }
    return object;
  }

  private formAppearanceObject(appearance: PdfFormAppearance): PdfXObject {
    const object = new PdfXObject(this, '/Form', encodeLatin1(appearance.content));
    object.params.set('/FormType', new PdfNum(1));
    object.params.set('/BBox', PdfArray.fromNum([0, 0, appearance.width, appearance.height]));
    const resources = new PdfDict();
    if (appearance.fonts.size > 0) {
      const fonts = new Map<string, PdfObject<PdfDict>>();
      for (const [font, name] of appearance.fonts) fonts.set(name, this.fontObject(font));
      resources.set('/Font', PdfDict.fromObjectMap(fonts));
    }
    if (appearance.images.size > 0) {
      const images = new Map<string, PdfImageObject>();
      for (const [image, name] of appearance.images) images.set(name, this.imageObject(image));
      resources.set('/XObject', PdfDict.fromObjectMap(images));
    }
    if (appearance.graphicStates.size > 0) {
      resources.set('/ExtGState', new PdfDict(Array.from(appearance.graphicStates, ([name, state]) => [name, this.resolveGraphicState(state)])));
    }
    if (appearance.patterns.size > 0) {
      resources.set('/Pattern', new PdfDict(appearance.patterns));
    }
    if (appearance.shadings.size > 0) {
      resources.set('/Shading', new PdfDict(appearance.shadings));
    }
    if (appearance.forms !== undefined && appearance.forms.size > 0) {
      const xobjects = resources.get('/XObject') as PdfDict | undefined;
      const entries = xobjects ?? new PdfDict();
      for (const [form, name] of appearance.forms) entries.set(name, this.formObject(form).ref());
      resources.set('/XObject', entries);
    }
    if (!resources.isEmpty) object.params.set('/Resources', resources);
    return object;
  }

  private resolveFormAppearances(
    appearances: PdfFormAppearances | undefined
  ): PdfResolvedFormAppearances | null {
    if (appearances === undefined) return null;
    const normalStates = appearances.normalStates === undefined
      ? undefined
      : new Map([...appearances.normalStates].map(([name, appearance]) => [
        name,
        this.formAppearanceObject(appearance)
      ]));
    return {
      normal: appearances.normal === undefined
        ? undefined
        : this.formAppearanceObject(appearances.normal),
      normalStates,
      down: appearances.down === undefined
        ? undefined
        : this.formAppearanceObject(appearances.down),
      rollover: appearances.rollover === undefined
        ? undefined
        : this.formAppearanceObject(appearances.rollover)
    };
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
    content: string | Uint8Array,
    fonts: ReadonlyMap<PdfFont, string> = new Map(),
    graphicStates: ReadonlyMap<string, PdfDict> = new Map(),
    patterns: ReadonlyMap<string, PdfDict> = new Map(),
    shadings: ReadonlyMap<string, PdfDict> = new Map(),
    images: ReadonlyMap<PdfImage, string> = new Map(),
    annotations: readonly PdfAnnotationSpec[] = [],
    forms: ReadonlyMap<PdfFormXObject, string> = new Map()
  ): PdfPage {
    const resources: [string, PdfObject<PdfDict>][] = [];
    for (const [font, name] of fonts) {
      resources.push([name, this.fontObject(font)]);
    }

    const stream = new PdfObjectStream(
      this,
      typeof content === 'string' ? encodeLatin1(content) : content
    );
    const page = new PdfPage(this, this.pageList, format);

    for (const [name, object] of resources) {
      page.addFont(name, object);
    }

    for (const [name, state] of graphicStates) {
      page.addGraphicState(name, this.resolveGraphicState(state));
    }

    for (const [name, pattern] of patterns) {
      page.addPattern(name, pattern);
    }

    for (const [name, shading] of shadings) {
      page.addShading(name, shading);
    }

    for (const [image, name] of images) {
      page.addXObject(name, this.imageObject(image));
    }

    for (const [form, name] of forms) page.addXObject(name, this.formObject(form));

    const pdfa = this.settings.pdfa !== undefined;
    for (const annotation of annotations) {
      let appearanceName: string | null = null;
      if (annotation.kind === 'form') {
        const font = annotation.font;
        if (font !== undefined) {
          appearanceName = this.formFontNames.get(font) ?? null;
          if (appearanceName === null) {
            appearanceName = `/FForm${this.formFontNames.size + 1}`;
            this.formFontNames.set(font, appearanceName);
            this.catalog.formFonts.set(appearanceName, this.fontObject(font));
          }
        }
      }
      const source = annotation.kind === 'form' ? annotation.appearances : undefined;
      // PDF/A allows only the normal appearance, and requires one on every
      // annotation but a link (ISO 19005-2 6.3.3).
      let appearances = this.resolveFormAppearances(pdfa && source !== undefined
        ? { normal: source.normal, normalStates: source.normalStates }
        : source);
      if (pdfa && annotation.kind !== 'url' && annotation.kind !== 'destination'
        && appearances?.normal === undefined && appearances?.normalStates === undefined) {
        appearances = { normal: this.emptyAppearance() };
      }
      const object = new PdfAnnotation(this, page, annotation, appearanceName, appearances);
      if (annotation.kind === 'form') this.addFormField(object, annotation.name);
    }

    page.contents.push(stream);
    return page;
  }

  private emptyForm: PdfXObject | null = null;

  /**
   * One shared, empty appearance stream. A viewer scales its box onto each
   * annotation's `/Rect`, so a unit box serves every size.
   */
  private emptyAppearance(): PdfXObject {
    return this.emptyForm ??= this.formAppearanceObject({
      width: 1, height: 1, content: '', fonts: new Map(), graphicStates: new Map(),
      patterns: new Map(), shadings: new Map(), images: new Map()
    });
  }

  /**
   * List a widget in `/AcroForm`, grouping widgets that share a field name.
   *
   * Each widget used to be its own merged field-and-widget dictionary, so a
   * `TextField` in a `MultiPage` header became one root field per page, all
   * named alike with values of their own. ISO 32000-1 12.7.3.1 allows the
   * merged form only for a single widget, so from the second widget on the
   * name gets one parent field with the widgets as `/Kids` - upstream #1980's
   * `prepareAcroForm`, done as pages arrive. A name used once is unchanged.
   */
  private addFormField(widget: PdfAnnotation, name: string): void {
    const kids = this.formFieldKids.get(name);
    if (kids === undefined) {
      this.formFieldKids.set(name, [widget]);
      this.catalog.formFields.push(widget);
      return;
    }
    const first = kids[0]!;
    let parent = first.parent;
    if (parent === null) {
      parent = new PdfObject(this, new PdfDict([['/T', new PdfString(name)]]));
      first.parent = parent;
      this.catalog.formFields[this.catalog.formFields.indexOf(first)] = parent;
    }
    widget.parent = parent;
    kids.push(widget);
    parent.params.set('/Kids', PdfArray.fromObjects(kids));
  }

  addNavigation(
    outlines: readonly SerializedOutline[],
    pageMode: PdfPageMode,
    destinations: readonly SerializedDestination[] = []
  ): void {
    const names = outlines.length > 0 || destinations.length > 0 ? this.catalog.names ?? new PdfNames(this) : null;
    for (const entry of destinations) {
      const page = this.pageList.pages[entry.page - 1];
      if (page !== undefined) {
        names?.addDestination(entry.name, page, {
          x: entry.x ?? undefined,
          y: entry.y ?? undefined,
          zoom: entry.zoom ?? undefined
        });
      }
    }

    if (outlines.length > 0) {
      const root = new PdfOutline(this);
      const levels: PdfOutline[] = [root];

      for (const entry of outlines) {
        const page = this.pageList.pages[entry.page - 1];
        if (page === undefined) continue;
        // An `Outline` widget is an `Anchor` and has already registered its
        // destination, with its x and zoom; registering it again wrote the
        // name twice. A `Header` registers none, so its outline does it here.
        if (names !== null && !names.has(entry.anchor)) names.addDestination(entry.anchor, page, { y: entry.y });
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
      this.catalog.outline = root;
    }

    if (names !== null) this.catalog.names = names;
    this.catalog.showOutlines = pageMode === 'outlines';
  }

  addPageLabels(labels: readonly SerializedPageLabel[]): void {
    if (labels.length === 0) return;
    const pageLabels = new PdfPageLabels(this);
    for (const { pageIndex, label } of labels) pageLabels.labels.set(pageIndex, label);
    this.catalog.pageLabels = pageLabels;
  }

  save(): Uint8Array {
    const stream = new PdfStream();
    this.write(stream);
    return stream.output();
  }

  /** Serialize directly to a caller-owned synchronous destination. */
  write(stream: PdfStream): void {
    for (const object of this.objects) {
      object.prepare();
    }

    this.xref.params.set('/Root', this.catalog.ref());
    this.xref.params.set('/Info', this.info.ref());
    if (this.catalog.colorProfile !== null) {
      this.checkPdfa(this.catalog.colorProfile.colorSpace);
      const id = new PdfHexBytes(this.documentId());
      this.xref.params.set('/ID', new PdfArray([id, id]));
    }

    this.xref.output(stream);
  }

  /**
   * The PDF/A rules that are cheap to check on finished objects: device colour
   * against the output intent (ISO 19005-2 6.2.4.3) and annotation colours
   * (6.3.3), page size and `q` nesting limits (6.1.13).
   */
  private checkPdfa(space: PdfaColorSpace): void {
    for (const { pageFormat: { width, height } } of this.pageList.pages) {
      if (!(width >= 3 && height >= 3 && width <= 14400 && height <= 14400)) {
        throw new RangeError(`PDF/A pages are 3 to 14400 points a side, not ${width} x ${height}`);
      }
    }
    const used = new Set<string>();
    const contents = new Set(this.pageList.pages.flatMap(page => page.contents));
    for (const object of this.objects) {
      const params = object.params;
      deviceSpaces(params, used);
      if (params instanceof PdfDictStream && (contents.has(object) || isName(params.get('/Subtype'), '/Form'))) {
        const depth = scanContent(params.data, used);
        if (depth > 28) throw new RangeError(`PDF/A limits q nesting to 28, not ${depth}`);
      }
      if (space !== 'RGB' && params instanceof PdfDict && isName(params.get('/Type'), '/Annot')
        && (params.has('/C') || params.has('/IC'))) {
        throw new RangeError(`PDF/A allows annotation colours only under an RGB output intent, not ${space}`);
      }
    }
    for (const [device, painted] of [['RGB', 'an RGB colour, image, gradient or soft mask'], ['CMYK', 'a PdfColorCmyk or CMYK JPEG']] as const) {
      if (used.has(device) && space !== device) {
        throw new RangeError(`PDF/A: Device${device} (${painted}) is painted, but the output intent profile is ${space}`);
      }
    }
  }

  /**
   * The trailer `/ID`: 16 bytes hashed from every object's dictionary and
   * uncompressed data. It need not be cryptographic, only deterministic, so
   * that `save()` stays repeatable, and distinct for distinct documents.
   */
  private documentId(): Uint8Array {
    const hash = new Uint32Array([0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35]);
    const dicts = new PdfStream();
    for (const { params } of this.objects) {
      if (params instanceof PdfDictStream) {
        new PdfDict(params.values).output(dicts);
        mix(hash, params.data);
      } else {
        params.output(dicts);
      }
    }
    mix(hash, dicts.view());
    const id = new Uint8Array(16);
    for (let lane = 0; lane < 4; lane++) {
      let h = (hash[lane]! ^ Math.imul(hash[(lane + 1) % 4]!, 0x9e3779b1)) >>> 0;
      h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
      h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
      h ^= h >>> 16;
      for (let byte = 0; byte < 4; byte++) id[lane * 4 + byte] = (h >>> (24 - byte * 8)) & 0xff;
    }
    return id;
  }
}

/** A byte string written in hex, for the trailer `/ID`. */
class PdfHexBytes extends PdfDataType {
  private readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    super();
    this.bytes = bytes;
  }

  override output(s: PdfStream): void {
    let hex = '';
    for (const byte of this.bytes) hex += byte.toString(16).padStart(2, '0');
    s.putString(`<${hex}>`);
  }
}

/** Four 32-bit lanes over `bytes`, folded into `hash`. */
function mix(hash: Uint32Array, bytes: Uint8Array): void {
  let a = hash[0]!;
  let b = hash[1]!;
  let c = hash[2]!;
  let d = hash[3]!;
  for (let index = 0; index < bytes.length; index++) {
    const x = bytes[index]!;
    a = Math.imul(a ^ x, 0x01000193);
    b = Math.imul(b + x, 0x5bd1e995) ^ (b >>> 15);
    c = (Math.imul(c ^ x, 0x85ebca6b) + a) | 0;
    d = Math.imul(d + x, 0xc2b2ae35) ^ (c >>> 13);
  }
  hash[0] = a;
  hash[1] = b;
  hash[2] = c;
  hash[3] = d;
}

const isName = (value: PdfDataType | undefined, name: string): boolean => value instanceof PdfName && value.value === name;

/** Note `/DeviceRGB` and `/DeviceCMYK` anywhere in an object's dictionaries. */
function deviceSpaces(value: PdfDataType, used: Set<string>): void {
  if (value instanceof PdfName) {
    if (value.value === '/DeviceRGB') used.add('RGB');
    else if (value.value === '/DeviceCMYK') used.add('CMYK');
  } else if (value instanceof PdfDict) {
    for (const entry of value.values.values()) deviceSpaces(entry, used);
  } else if (value instanceof PdfArray) {
    for (const entry of value.values) deviceSpaces(entry, used);
  }
}

/** Neither white space nor a delimiter (ISO 32000-1 7.2.2). */
const isRegular = (c: number): boolean => c > 0x20 && c !== 0x28 && c !== 0x29 && c !== 0x3c && c !== 0x3e
  && c !== 0x5b && c !== 0x5d && c !== 0x7b && c !== 0x7d && c !== 0x2f && c !== 0x25;

/**
 * Tokenize a content stream, skipping strings and comments: note the device
 * colour operators and names it uses, and return its deepest `q` nesting.
 */
function scanContent(data: Uint8Array, used: Set<string>): number {
  let depth = 0;
  let deepest = 0;
  for (let index = 0; index < data.length;) {
    const c = data[index]!;
    if (c === 0x28) {
      let open = 0;
      do {
        const d = data[index++];
        if (d === 0x5c) index++;
        else if (d === 0x28) open++;
        else if (d === 0x29) open--;
      } while (open > 0 && index < data.length);
    } else if (c === 0x3c) {
      if (data[index + 1] === 0x3c) {
        index += 2;
      } else {
        while (index < data.length && data[index] !== 0x3e) index++;
        index++;
      }
    } else if (c === 0x25) {
      while (index < data.length && data[index] !== 0x0a && data[index] !== 0x0d) index++;
    } else if (isRegular(c) || c === 0x2f) {
      const start = index++;
      while (index < data.length && isRegular(data[index]!)) index++;
      const length = index - start;
      const next = data[start + 1];
      if (length === 1 && (c === 0x6b || c === 0x4b)) used.add('CMYK');
      else if (length === 2 && ((c === 0x72 && next === 0x67) || (c === 0x52 && next === 0x47))) used.add('RGB');
      else if (length === 1 && c === 0x71) deepest = Math.max(deepest, ++depth);
      else if (length === 1 && c === 0x51) depth--;
      else if (c === 0x2f && (length === 10 || length === 11)) {
        deviceSpaces(new PdfName(String.fromCharCode(...data.subarray(start, index))), used);
      }
    } else {
      index++;
    }
  }
  return deepest;
}

/** Build a document from already-rendered pages and collect its bytes. */
export function serializePdf(
  pages: readonly SerializedPage[],
  metadata: DocumentMetadata,
  outlines: readonly SerializedOutline[] = [],
  pageMode: PdfPageMode = 'none',
  destinations: readonly SerializedDestination[] = [],
  pageLabels: readonly SerializedPageLabel[] = [],
  settings: PdfSettings = DEFAULT_PDF_SETTINGS
): Uint8Array {
  const stream = new PdfStream();
  writePdf(stream, pages, metadata, outlines, pageMode, destinations, pageLabels, settings);
  return stream.output();
}

/** Write already-rendered pages without collecting a complete serialized copy. */
export function writePdf(
  output: PdfStream,
  pages: readonly SerializedPage[],
  metadata: DocumentMetadata,
  outlines: readonly SerializedOutline[] = [],
  pageMode: PdfPageMode = 'none',
  destinations: readonly SerializedDestination[] = [],
  pageLabels: readonly SerializedPageLabel[] = [],
  settings: PdfSettings = DEFAULT_PDF_SETTINGS
): void {
  const document = new PdfDocument(metadata, settings);

  for (const page of pages) {
    document.addPage(
      page.format,
      page.content,
      page.fonts,
      page.graphicStates,
      page.patterns,
      page.shadings,
      page.images,
      page.annotations,
      page.forms
    );
  }

  document.addNavigation(outlines, pageMode, destinations);
  document.addPageLabels(pageLabels);

  document.write(output);
}
