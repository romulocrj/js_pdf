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
 *   - pdf/lib/src/pdf/obj/unicode_cmap.dart
 *
 * The `/ToUnicode` CMap: the table that turns the CIDs in a content stream back
 * into the text they came from, which is what makes an embedded-font document
 * searchable and copyable. Without it a reader sees glyph numbers.
 */

import { encodeLatin1 } from '../format/stream.ts';
import { PdfObjectStream } from './object_stream.ts';
import type { PdfObjectRegistry } from './object.ts';

function hex4(value: number): string {
  return value.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Upstream fills this in during `prepare()`, because its font keeps adding code
 * points to the map while pages are still being written. The port renders every
 * page to operators before any object exists, so the list is already final here
 * and the stream can be built in the constructor.
 */
export function unicodeCmapStream(cmap: readonly number[], protect = false): string {
  // `protect` blanks every mapping to a space, which leaves the text visible on
  // the page but unrecoverable by copy or extraction.
  const values = protect
    ? cmap.map((value, index) => (index === 0 ? value : 0x20))
    : cmap;

  let output = '/CIDInit/ProcSet\nfindresource begin\n'
    + '12 dict begin\n'
    + 'begincmap\n'
    + '/CIDSystemInfo<<\n'
    + '/Registry (Adobe)\n'
    + '/Ordering (UCS)\n'
    + '/Supplement 0\n'
    + '>> def\n'
    + '/CMapName/Adobe-Identity-UCS def\n'
    + '/CMapType 2 def\n'
    + '1 begincodespacerange\n'
    + '<0000> <FFFF>\n'
    + 'endcodespacerange\n'
    + `${values.length} beginbfchar\n`;

  for (let key = 0; key < values.length; key++) {
    output += `<${hex4(key)}> <${hex4(values[key] ?? 0)}>\n`;
  }

  output += 'endbfchar\n'
    + 'endcmap\n'
    + 'CMapName currentdict /CMap defineresource pop\n'
    + 'end\n'
    + 'end';

  return output;
}

export class PdfUnicodeCmap extends PdfObjectStream {
  constructor(document: PdfObjectRegistry, cmap: readonly number[], protect = false) {
    super(document, encodeLatin1(unicodeCmapStream(cmap, protect)));
  }
}
