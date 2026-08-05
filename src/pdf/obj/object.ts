/*
 * Ported to JavaScript from DavBfr/dart_pdf.
 *
 * Original work:
 * Copyright (C) 2017, David PHAM-VAN
 *
 * JavaScript port:
 * Copyright (C) 2026, Romulo Campos
 *
 * This file has been substantially modified from the original Dart source.
 *
 * Licensed under the Apache License, Version 2.0.
 *
 * Original Dart sources ported into this file:
 *   - pdf/lib/src/pdf/obj/object.dart
 *   - pdf/lib/src/pdf/obj/object_dict.dart
 */

import type { PdfDataType } from '../format/base.ts';
import { PdfDict } from '../format/dict.ts';
import { PdfName } from '../format/name.ts';
import { PdfObjectBase } from '../format/object_base.ts';

/**
 * The document side of an indirect object. Registering with the document is the
 * constructor's job, exactly as upstream: an object that exists is an object
 * that gets written, so there is no way to hand out a reference to something
 * the file will not contain.
 *
 * `PdfDocument` is taken structurally rather than imported to keep the import
 * direction one-way — `document.ts` owns the concrete registry.
 */
export interface PdfObjectRegistry {
  genSerial(): number;
  register(object: PdfObjectBase<PdfDataType>): void;
}

export class PdfObject<T extends PdfDataType> extends PdfObjectBase<T> {
  constructor(document: PdfObjectRegistry, params: T, objser?: number) {
    super(objser ?? document.genSerial(), params);
    document.register(this);
  }
}

/** An indirect object wrapping a dictionary — the common case. */
export class PdfObjectDict extends PdfObject<PdfDict> {
  constructor(document: PdfObjectRegistry, type?: string, objser?: number) {
    super(document, new PdfDict(), objser);
    if (type != null) {
      this.params.set('/Type', new PdfName(type));
    }
  }
}
