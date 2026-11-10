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
 *
 * One writer serves every CMap the port emits: the composite font's
 * `/ToUnicode`, the simple TrueType one keyed by single bytes, and the CFF
 * code-to-CID `/Encoding`. Two upstream bugs are fixed here, as PRs #2011 and
 * #2029 do: a destination above U+FFFF is written as a UTF-16BE surrogate pair
 * rather than as five or six hex digits, which a reader decodes as a different
 * character followed by a NUL, and a section holds at most the 100 entries the
 * CMap format allows rather than the whole font.
 */

import { pdfLiteral } from '../format/string.ts';
import { encodeLatin1 } from '../format/stream.ts';
import { PdfObjectStream } from './object_stream.ts';
import type { PdfObjectRegistry } from './object.ts';

const hex4 = (value: number): string => value.toString(16).toUpperCase().padStart(4, '0');

/**
 * A CMap program for `values`, where `values[code]` is the code point code
 * `code` stands for — or, with `cid`, the CID it selects. `simple` keys the
 * codes as single bytes. `protect` blanks every mapping but `.notdef` to a
 * space, which leaves the text visible on the page but unrecoverable by copy
 * or extraction.
 *
 * Upstream fills its CMap in during `prepare()`, because its font keeps adding
 * code points while pages are still being written. The port renders every page
 * to operators before any object exists, so the list is already final here.
 */
export function fontCmap(values: readonly number[], protect = false, cid = false, simple = false,
  ros = { registry: 'Adobe', ordering: 'UCS', supplement: 0 }): string {
  let result = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n'
    + `/CIDSystemInfo << /Registry ${pdfLiteral(ros.registry)} /Ordering ${pdfLiteral(ros.ordering)} /Supplement ${ros.supplement} >> def\n`
    + `/CMapName /${cid ? 'JsPdfEncoding' : 'Adobe-Identity-UCS'} def\n/CMapType ${cid ? 1 : 2} def\n`
    + (cid ? '/WMode 0 def\n' : '')
    + `1 begincodespacerange\n<${simple ? '00> <FF' : '0000> <FFFF'}>\nendcodespacerange\n`;
  for (let start = 0; start < values.length; start += 100) {
    const end = Math.min(start + 100, values.length);
    result += `${end - start} begin${cid ? 'cid' : 'bf'}char\n`;
    for (let index = start; index < end; index++) {
      const rune = protect && index !== 0 ? 32 : values[index]!;
      const destination = rune <= 0xffff ? hex4(rune) : hex4(0xd800 + ((rune - 0x10000) >> 10)) + hex4(0xdc00 + ((rune - 0x10000) & 1023));
      result += `<${simple ? index.toString(16).padStart(2, '0') : hex4(index)}> ${cid ? rune : '<' + destination + '>'}\n`;
    }
    result += `end${cid ? 'cid' : 'bf'}char\n`;
  }
  return result + 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend';
}

export class PdfUnicodeCmap extends PdfObjectStream {
  constructor(document: PdfObjectRegistry, cmap: readonly number[], protect = false, simple = false) {
    super(document, encodeLatin1(fontCmap(cmap, protect, false, simple)));
  }
}
