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
 *   - pdf/lib/src/pdf/obj/graphic_stream.dart
 *
 * Anything that owns a content stream also owns the `/Resources` dictionary
 * naming what that stream refers to. Upstream expresses this as
 * `mixin PdfGraphicStream on PdfObject<PdfDict>`, so both `PdfPage` and
 * `PdfGraphicXObject` can take it; TypeScript has no mixin that survives
 * `strict` without an `any`, so the port makes it a base class and `PdfPage`
 * extends it. Form XObjects (phase 4) need the same assembly — when they land,
 * lift `resources()` out into a free function rather than duplicating it.
 *
 * Two further divergences:
 *
 *   - `prepare()` sets `/Resources`; it never merges into an existing one.
 *     Upstream merges because a caller may have written the key first, which
 *     nothing in the port does.
 *   - No `/ProcSet`. Upstream emits it when the stream was altered, for readers
 *     predating PDF 1.4. The port has no `altered` flag — it never drops an
 *     untouched content stream — and the key is long deprecated.
 *
 * `/ExtGState` and `/Pattern` are registered per stream here, whereas upstream points
 * every stream at one document-wide states object; that indirection is worth
 * adding when opacity and blend modes actually exist.
 */

import type { PdfDataType } from '../format/base.ts';
import { PdfDict } from '../format/dict.ts';
import type { PdfObjectBase } from '../format/object_base.ts';
import { PdfObject } from './object.ts';

/** A `/Resources` entry always points at an indirect object, never a value. */
export type PdfResource = PdfObjectBase<PdfDataType>;

export class PdfGraphicStream extends PdfObject<PdfDict> {
  /**
   * Resource name to object, for each `/Resources` sub-dictionary.
   *
   * The name is chosen by whoever wrote the content stream, because the stream
   * has already spelled it out — `/F1 12 Tf` is only meaningful if `/Font` maps
   * `/F1` to the same object. Upstream instead derives every name from the
   * object's serial number, which it can do because a font there is an indirect
   * object from the moment it is created; in the port a page is rendered to
   * operators before any document exists. See `PdfCanvas.addFont`.
   */
  readonly fonts = new Map<string, PdfResource>();
  readonly xObjects = new Map<string, PdfResource>();

  /**
   * `/ExtGState` holds dictionaries, not references — the one place a resource
   * sub-dictionary maps a name to a value rather than an object. Upstream points
   * every stream at a single document-wide `PdfGraphicStates` object; the port
   * writes each page's states inline, for the same reason names are page-local.
   */
  readonly graphicStates = new Map<string, PdfDict>();
  readonly patterns = new Map<string, PdfDict>();
  readonly shadings = new Map<string, PdfDict>();

  /** Register a font under the name the content stream used. First one wins. */
  addFont(name: string, font: PdfResource): void {
    if (!this.fonts.has(name)) {
      this.fonts.set(name, font);
    }
  }

  addXObject(name: string, xObject: PdfResource): void {
    if (!this.xObjects.has(name)) {
      this.xObjects.set(name, xObject);
    }
  }

  addGraphicState(name: string, state: PdfDict): void {
    if (!this.graphicStates.has(name)) {
      this.graphicStates.set(name, state);
    }
  }

  addPattern(name: string, pattern: PdfDict): void {
    if (!this.patterns.has(name)) {
      this.patterns.set(name, pattern);
    }
  }

  addShading(name: string, shading: PdfDict): void {
    if (!this.shadings.has(name)) {
      this.shadings.set(name, shading);
    }
  }

  /**
   * The `/Resources` value, or null when this stream referred to nothing.
   *
   * Returned rather than assigned so a subclass decides where the key lands:
   * `PdfDict` emits in insertion order, so key order is part of the byte output.
   */
  protected resources(): PdfDict | null {
    const resources = new PdfDict();

    if (this.fonts.size > 0) {
      resources.set('/Font', PdfDict.fromObjectMap(this.fonts));
    }

    if (this.xObjects.size > 0) {
      resources.set('/XObject', PdfDict.fromObjectMap(this.xObjects));
    }

    if (this.graphicStates.size > 0) {
      resources.set('/ExtGState', new PdfDict(this.graphicStates));
    }

    if (this.patterns.size > 0) {
      resources.set('/Pattern', new PdfDict(this.patterns));
    }

    if (this.shadings.size > 0) {
      resources.set('/Shading', new PdfDict(this.shadings));
    }

    return resources.isEmpty ? null : resources;
  }

  override prepare(): void {
    const resources = this.resources();
    if (resources !== null) {
      this.params.set('/Resources', resources);
    }
  }
}
