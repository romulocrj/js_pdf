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
 *   - pdf/lib/src/pdf/obj/pdfa/pdfa_attached_files.dart
 *
 * PDF/A-3 embedded files: the file streams, their file specifications, the
 * `/EmbeddedFiles` name tree and the catalog `/AF` array. Upstream #1980's
 * fixes (Baghdady92) are applied from the start: the payload is encoded once
 * and `/Params /Size` is its byte count, not its UTF-16 length, and the name
 * tree is sorted on a copy - `/AF` keeps the caller's order - with every key,
 * `/F` and `/UF` written through `PdfString`, so a `)` or a non-Latin-1 name
 * is escaped rather than corrupting the object.
 *
 * Port changes: `data` may be bytes; the option names are `mimeType` and
 * `relationship` without upstream's leading slash; `description` writes the
 * recommended `/Desc`; `/ModDate` is UTC (upstream labelled local time
 * `+00'00'`) and defaults to the document's creation date. Duplicate names,
 * which a name tree cannot hold, are rejected.
 */

import { utf8Encode } from '../../../base/utf8.ts';
import { PdfArray } from '../../format/array.ts';
import { PdfDict } from '../../format/dict.ts';
import { PdfName } from '../../format/name.ts';
import { PdfNum } from '../../format/num.ts';
import { PdfString, pdfTextBytes } from '../../format/string.ts';
import { PdfObject } from '../object.ts';
import type { PdfObjectRegistry } from '../object.ts';
import { PdfObjectStream } from '../object_stream.ts';
import type { PdfCatalog } from '../catalog.ts';

/** How an attachment relates to the document (ISO 19005-3 Annex E, `/AFRelationship`). */
export type PdfaRelationship = 'Data' | 'Source' | 'Alternative' | 'Supplement' | 'Unspecified';

const RELATIONSHIPS: readonly string[] = ['Data', 'Source', 'Alternative', 'Supplement', 'Unspecified'];

export interface PdfaAttachedFileOptions {
  readonly name: string;
  /** A string is embedded as UTF-8. */
  readonly data: string | Uint8Array;
  /** The MIME type written as `/Subtype`; `text/xml` by default, as upstream. */
  readonly mimeType?: string;
  /** `Alternative` by default, as upstream. */
  readonly relationship?: PdfaRelationship;
  readonly description?: string | null;
  /** `/Params /ModDate`; the document's creation date when omitted. */
  readonly modificationDate?: Date | null;
}

/** One validated attachment, with its payload already encoded. */
export class PdfaAttachedFile {
  readonly name: string;
  readonly data: Uint8Array;
  readonly mimeType: string;
  readonly relationship: PdfaRelationship;
  readonly description: string | null;
  readonly modificationDate: Date | null;

  constructor({
    name, data, mimeType = 'text/xml', relationship = 'Alternative', description = null, modificationDate = null
  }: PdfaAttachedFileOptions) {
    const fail = (message: string): never => { throw new TypeError(`PDF/A attachment ${JSON.stringify(name)}: ${message}`); };
    if (typeof name !== 'string' || name === '') fail('the name must be a non-empty string');
    if (typeof data !== 'string' && !(data instanceof Uint8Array)) fail('data must be a string or a Uint8Array');
    if (typeof mimeType !== 'string' || !/^[^\s/]+\/[^\s/]+$/.test(mimeType)) fail('mimeType must be type/subtype');
    if (!RELATIONSHIPS.includes(relationship)) fail(`relationship must be ${RELATIONSHIPS.join(', ')}`);
    if (description !== null && typeof description !== 'string') fail('description must be a string');
    if (modificationDate !== null && !(modificationDate instanceof Date && Number.isFinite(modificationDate.getTime()))) {
      fail('modificationDate must be a valid Date');
    }
    this.name = name;
    this.data = typeof data === 'string' ? utf8Encode(data) : data;
    this.mimeType = mimeType;
    this.relationship = relationship;
    this.description = description;
    this.modificationDate = modificationDate;
  }
}

/** The embedded files of a PDF/A-3 document; registers itself on the catalog. */
export class PdfaAttachedFiles {
  readonly files: readonly PdfaAttachedFile[];
  private readonly specs: PdfObject<PdfDict>[] = [];
  /** The `/EmbeddedFiles` name tree. */
  readonly names: PdfObject<PdfDict>;

  constructor(
    document: PdfObjectRegistry & { readonly catalog: PdfCatalog },
    files: readonly (PdfaAttachedFile | PdfaAttachedFileOptions)[],
    date: Date = new Date()
  ) {
    this.files = files.map(file => (file instanceof PdfaAttachedFile ? file : new PdfaAttachedFile(file)));
    const keyed: { readonly key: string; readonly name: string; readonly spec: PdfObject<PdfDict> }[] = [];
    for (const file of this.files) {
      const stream = new PdfObjectStream(document, file.data);
      stream.params.set('/Type', new PdfName('/EmbeddedFile'));
      stream.params.set('/Subtype', new PdfName('/' + file.mimeType));
      stream.params.set('/Params', new PdfDict([
        ['/Size', new PdfNum(file.data.length)],
        ['/ModDate', PdfString.fromDate(file.modificationDate ?? date)]
      ]));
      const spec = new PdfObject(document, new PdfDict([
        ['/Type', new PdfName('/Filespec')],
        ['/F', new PdfString(file.name)],
        ['/UF', new PdfString(file.name)],
        ['/EF', new PdfDict([['/F', stream.ref()]])],
        ['/AFRelationship', new PdfName('/' + file.relationship)]
      ]));
      if (file.description) spec.params.set('/Desc', new PdfString(file.description));
      this.specs.push(spec);
      keyed.push({ key: pdfTextBytes(file.name), name: file.name, spec });
    }
    // Keys ascend in the bytes they are written as (ISO 32000-1 7.9.6).
    keyed.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    keyed.forEach((entry, index) => {
      if (index > 0 && entry.key === keyed[index - 1]!.key) throw new RangeError(`PDF/A attachment name ${entry.name} is not unique`);
    });
    this.names = new PdfObject(document, new PdfDict([
      ['/Names', new PdfArray(keyed.flatMap(entry => [new PdfString(entry.name), entry.spec.ref()]))]
    ]));
    document.catalog.attached = this;
  }

  get isNotEmpty(): boolean {
    return this.specs.length > 0;
  }

  catalogNames(): PdfDict {
    return new PdfDict([['/EmbeddedFiles', this.names.ref()]]);
  }

  catalogAF(): PdfArray {
    return PdfArray.fromObjects(this.specs);
  }
}
