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
 *   - pdf/lib/src/pdf/format/xref.dart
 *
 * PORT GAP: classic cross-reference table only. Upstream also writes PDF 1.5
 * cross-reference streams with compressed object entries, selected by
 * `PdfVersion`; the port emits the 1.7 header with a classic table, which every
 * reader accepts. No incremental update, so no `/Prev`.
 *
 * Object bodies are written in serial order rather than upstream's insertion
 * order. That makes the table a single contiguous block and lets the document
 * assign serials in whatever order reads best — see `document.ts`, which numbers
 * the catalog before the page list.
 */

import { PdfDict } from './dict.ts';
import { PdfNum } from './num.ts';
import type { PdfDataType } from './base.ts';
import type { PdfObjectBase } from './object_base.ts';
import type { PdfStream } from './stream.ts';

/** Where one object landed in the file. */
interface PdfXref {
  readonly ser: number;
  readonly gen: number;
  readonly offset: number;
}

/** `0000000123 00000 n ` — a fixed-width table row, trailing space included. */
function legacyRef(xref: PdfXref, free = false): string {
  const offset = String(xref.offset).padStart(10, '0');
  const gen = String(xref.gen).padStart(5, '0');
  return `${offset} ${gen} ${free ? 'f' : 'n'} `;
}

/**
 * The file writer: header, every object, the cross-reference table, trailer.
 *
 * `params` is the trailer dictionary. The document fills `/Size`, `/Root` and
 * `/Info` — in that order, which is the order they are emitted.
 */
export class PdfXrefTable {
  readonly params = new PdfDict();
  readonly objects: PdfObjectBase<PdfDataType>[] = [];

  add(object: PdfObjectBase<PdfDataType>): void {
    this.objects.push(object);
  }

  private writeBlock(s: PdfStream, firstId: number, block: readonly string[]): void {
    s.putString(`${firstId} ${block.length}\n`);
    for (const row of block) {
      s.putString(row);
      s.putByte(0x0a);
    }
  }

  output(s: PdfStream): void {
    // The binary marker on line two tells a transfer agent this is not text.
    s.putString('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n');

    const ordered = [...this.objects].sort((a, b) => a.objser - b.objser);
    const xrefList: PdfXref[] = [];

    for (const object of ordered) {
      const offset = object.output(s);
      xrefList.push({ ser: object.objser, gen: object.objgen, offset });
    }

    const xrefOffset = s.offset;
    s.putString('xref\n');

    // Object 0 is the head of the free list and is never a real object.
    let firstId = 0;
    let lastId = 0;
    let block: string[] = [legacyRef({ ser: 0, gen: 65535, offset: 0 }, true)];

    for (const xref of xrefList) {
      if (xref.ser !== lastId + 1) {
        this.writeBlock(s, firstId, block);
        block = [];
        firstId = xref.ser;
      }
      block.push(legacyRef(xref));
      lastId = xref.ser;
    }
    this.writeBlock(s, firstId, block);

    // `/Size` is derived, so it is written here rather than by the caller, and
    // first — upstream appends it last. Key order is part of the byte output.
    const trailer = new PdfDict();
    trailer.set('/Size', new PdfNum(lastId + 1));
    for (const [key, value] of this.params.values) {
      trailer.set(key, value);
    }

    s.putString('trailer\n');
    trailer.output(s);
    s.putByte(0x0a);

    s.putString(`startxref\n${xrefOffset}\n%%EOF\n`);
  }
}
