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
 *   - pdf/lib/src/pdf/obj/ttffont.dart
 *   - pdf/lib/src/pdf/obj/font.dart
 *
 * An embedded TrueType font, written as a Type0 composite with `/Identity-H`
 * encoding. This is what removes the WinAnsi ceiling: text is emitted as CIDs,
 * so any code point the font has a glyph for can be drawn, and the `/ToUnicode`
 * CMap maps those CIDs back to the source text for search and copy.
 *
 * The CID assignment happens while pages are being drawn — `encodeText` hands
 * out the next CID for each new code point — and the font's objects are built
 * afterwards, from the finished list. That works because this port renders every
 * page to operators before the document exists; upstream instead defers the same
 * work to `prepare()`, since its fonts are indirect objects from birth.
 *
 * Full-program embedding supports simple WinAnsi TrueType and CFF1 OpenType.
 * CFF uses an explicit code-to-CID encoding and hmtx advances; no CFF subset
 * or charstring interpreter is included. CFF glyph ink bounds are approximate.
 *
 * Arabic diacritics retain their outlines but have zero advance after shaping,
 * matching upstream's bidi-enabled metrics.
 */

import { isArabicDiacritic } from '../font/arabic.ts';
import { PdfFontMetrics } from '../font/font_metrics.ts';
import type { PdfFont } from '../font/font.ts';
import type { PdfFontBitmap } from '../font/font.ts';
import { cffFontMetadata } from '../font/cff.ts';
import { TtfParser } from '../font/ttf_parser.ts';
import { TtfWriter } from '../font/ttf_writer.ts';
import { PdfArray } from '../format/array.ts';
import { PdfDict } from '../format/dict.ts';
import { PdfName } from '../format/name.ts';
import { PdfNum } from '../format/num.ts';
import { pdfHexString, pdfLiteral, PdfString, toWinAnsiByte } from '../format/string.ts';
import { encodeLatin1 } from '../format/stream.ts';
import { PdfFontDescriptor } from './font_descriptor.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';
import { PdfObjectStream } from './object_stream.ts';
import { PdfUnicodeCmap } from './unicode_cmap.ts';

export interface PdfTtfFontOptions {
  /**
   * Blank the `/ToUnicode` mapping, so the text renders but cannot be extracted.
   * Upstream's `protect` flag.
   */
  readonly protect?: boolean;
  /** False selects full-program WinAnsi TrueType; CFF requires composite text. */
  readonly unicode?: boolean;
  readonly simpleTrueTypeFonts?: boolean;
}

export class PdfTtfFont implements PdfFont {
  readonly font: TtfParser;
  readonly protect: boolean;
  readonly isComposite: boolean;
  private readonly cffMetadata: ReturnType<typeof cffFontMetadata> | null;

  /**
   * Code points in CID order: `cmap[cid]` is the rune drawn by CID `cid`. CID 0
   * is `.notdef`, as `/Identity-H` requires, so index 0 holds rune 0.
   */
  private readonly cmap: number[] = [0];
  private readonly cidByRune = new Map<number, number>([[0, 0]]);

  constructor(bytes: Uint8Array, { protect = false, unicode, simpleTrueTypeFonts = false }: PdfTtfFontOptions = {}) {
    this.font = new TtfParser(bytes);
    this.protect = protect;
    if (this.font.tableOffsets.has('CFF2')) throw new TypeError('CFF2 variable outlines require a static CFF1 instance');
    this.isComposite = unicode ?? (this.font.hasCff || (this.font.unicode && !simpleTrueTypeFonts));
    if (this.font.hasCff && !this.isComposite) throw new TypeError('CFF fonts require composite encoding');
    this.cffMetadata = this.font.hasCff ? cffFontMetadata(bytes.subarray(this.font.tableOffsets.get('CFF ')!,
      this.font.tableOffsets.get('CFF ')! + this.font.tableSize.get('CFF ')!), this.font.numGlyphs) : null;
    if (!this.font.hasCff && !this.font.tableOffsets.has('glyf') && !this.font.isBitmap) {
      throw new TypeError('Font has no supported outlines');
    }
  }

  get fontName(): string {
    return this.font.fontName;
  }

  get ascent(): number {
    return this.font.ascent / this.font.unitsPerEm;
  }

  get descent(): number {
    return this.font.descent / this.font.unitsPerEm;
  }

  get unitsPerEm(): number {
    return this.font.unitsPerEm;
  }

  /** Whether this font can draw `codePoint` at all. */
  isRuneSupported(codePoint: number): boolean {
    return (this.isComposite || winAnsiRune(toWinAnsiByte(codePoint)) === codePoint)
      && this.font.charToGlyphIndexMap.has(codePoint);
  }

  getBitmap(codePoint: number): PdfFontBitmap | null {
    return this.font.getBitmap(codePoint);
  }

  /** Metrics in em units, so the caller scales by the font size. */
  glyphMetrics(codePoint: number): PdfFontMetrics {
    if (!this.isComposite) codePoint = winAnsiRune(toWinAnsiByte(codePoint));
    const glyph = this.font.charToGlyphIndexMap.get(codePoint);
    if (glyph === undefined) {
      return PdfFontMetrics.zero;
    }
    const metrics = this.font.glyphInfoMap.get(glyph) ?? PdfFontMetrics.zero;
    if (!isArabicDiacritic(codePoint)) return metrics;
    return new PdfFontMetrics({
      left: metrics.left,
      top: metrics.top,
      right: metrics.right,
      bottom: metrics.bottom,
      ascent: metrics.ascent,
      descent: metrics.descent,
      advanceWidth: 0,
      leftBearing: metrics.leftBearing
    });
  }

  stringMetrics(text: string, size: number, letterSpacing = 0): PdfFontMetrics {
    const metrics: PdfFontMetrics[] = [];
    for (const character of String(text)) {
      metrics.push(this.glyphMetrics(character.codePointAt(0) ?? 0).scale(size));
    }
    return PdfFontMetrics.append(metrics, letterSpacing);
  }

  /**
   * `<0048006500…>` — one two-byte CID per code point, allocated on first use.
   *
   * Iteration is by code point, so an astral character is one CID rather than a
   * surrogate pair, which is what the format 12 `cmap` the parser reads expects.
   */
  encodeText(text: string): string {
    if (!this.isComposite) return pdfLiteral(text);
    const cids: number[] = [];

    for (const character of String(text)) {
      const rune = character.codePointAt(0) ?? 0;
      let cid = this.cidByRune.get(rune);

      if (cid === undefined) {
        cid = this.cmap.length;
        if (cid > 65535) throw new RangeError('Font encoding exceeds 65535 character codes');
        this.cmap.push(rune);
        this.cidByRune.set(rune, cid);
      }

      cids.push(cid);
    }

    return pdfHexString(cids);
  }

  /**
   * The Type0 font dictionary, plus the four objects it references: the subset
   * program, its descriptor, the per-CID widths, and the `/ToUnicode` CMap.
   */
  resourceDict(document: PdfObjectRegistry): PdfDict {
    if (!this.isComposite || this.font.hasCff) return this.fullFontResource(document);
    const subset = new TtfWriter(this.font).withChars(this.cmap);

    const file = new PdfObjectStream(document, subset);
    file.params.set('/Length1', new PdfNum(subset.length));

    const unitsPerEm = this.font.unitsPerEm;
    const descriptor = new PdfFontDescriptor(document, {
      fontName: this.fontName,
      file,
      flags: 4,
      fontBBox: [
        Math.trunc((this.font.xMin / unitsPerEm) * 1000),
        Math.trunc((this.font.yMin / unitsPerEm) * 1000),
        Math.trunc((this.font.xMax / unitsPerEm) * 1000),
        Math.trunc((this.font.yMax / unitsPerEm) * 1000)
      ],
      ascent: this.ascent,
      descent: this.descent
    });

    const widths = new PdfObject(
      document,
      PdfArray.fromNum(
        this.cmap.map(rune => Math.trunc(this.glyphMetrics(rune).advanceWidth * 1000))
      )
    );

    const unicodeCmap = new PdfUnicodeCmap(document, this.cmap, this.protect);

    const descendant = new PdfDict([
      ['/Type', new PdfName('/Font')],
      ['/BaseFont', new PdfName(`/${this.fontName}`)],
      ['/FontFile2', file.ref()],
      ['/FontDescriptor', descriptor.ref()],
      ['/W', new PdfArray([new PdfNum(0), widths.ref()])],
      ['/CIDToGIDMap', new PdfName('/Identity')],
      ['/DW', new PdfNum(1000)],
      ['/Subtype', new PdfName('/CIDFontType2')],
      ['/CIDSystemInfo', new PdfDict([
        ['/Supplement', new PdfNum(0)],
        ['/Registry', new PdfString('Adobe')],
        ['/Ordering', new PdfString('Identity-H')]
      ])]
    ]);

    return new PdfDict([
      ['/Type', new PdfName('/Font')],
      ['/Subtype', new PdfName('/Type0')],
      ['/BaseFont', new PdfName(`/${this.fontName}`)],
      ['/Encoding', new PdfName('/Identity-H')],
      ['/DescendantFonts', new PdfArray([descendant])],
      ['/ToUnicode', unicodeCmap.ref()]
    ]);
  }
  private fullFontResource(document: PdfObjectRegistry): PdfDict {
    const cff = this.font.hasCff;
    const file = new PdfObjectStream(document, this.font.bytes);
    if (cff) file.params.set('/Subtype', new PdfName('/OpenType'));
    else file.params.set('/Length1', new PdfNum(this.font.bytes.length));
    const scale = 1000 / this.font.unitsPerEm;
    const descriptor = new PdfFontDescriptor(document, {
      fontName: this.fontName, file, fileKey: cff ? '/FontFile3' : '/FontFile2', flags: cff ? 4 : 32,
      fontBBox: [this.font.xMin * scale, this.font.yMin * scale, this.font.xMax * scale, this.font.yMax * scale],
      ascent: this.ascent, descent: this.descent
    });
    if (!cff) {
      const widths = Array.from({ length: 224 }, (_, index) => {
        const rune = winAnsiRune(index + 32);
        return Math.trunc(this.glyphMetrics(rune).advanceWidth * 1000);
      });
      return new PdfDict([
        ['/Type', new PdfName('/Font')], ['/Subtype', new PdfName('/TrueType')],
        ['/BaseFont', new PdfName(`/${this.fontName}`)], ['/Encoding', new PdfName('/WinAnsiEncoding')],
        ['/FontDescriptor', descriptor.ref()], ['/FirstChar', new PdfNum(32)], ['/LastChar', new PdfNum(255)],
        ['/Widths', PdfArray.fromNum(widths)],
        ['/ToUnicode', new PdfObjectStream(document, encodeLatin1(fontCmap(Array.from({ length: 256 }, (_, i) => winAnsiRune(i)), this.protect, false, true))).ref()]
      ]);
    }
    const { registry, ordering, supplement } = this.cffMetadata!;
    const encoding = fontCmap(this.cmap.map(rune => this.cffMetadata!.cids[this.font.charToGlyphIndexMap.get(rune) ?? 0] ?? 0), false, true, false, { registry, ordering, supplement });
    const widths = new PdfArray();
    const seen = new Set<number>();
    for (const rune of this.cmap) {
      const cid = this.cffMetadata!.cids[this.font.charToGlyphIndexMap.get(rune) ?? 0] ?? 0;
      if (seen.has(cid)) continue;
      seen.add(cid);
      widths.add(new PdfNum(cid)); widths.add(PdfArray.fromNum([Math.trunc(this.glyphMetrics(rune).advanceWidth * 1000)]));
    }
    const descendant = new PdfDict([
      ['/Type', new PdfName('/Font')], ['/Subtype', new PdfName('/CIDFontType0')],
      ['/BaseFont', new PdfName(`/${this.fontName}`)], ['/FontDescriptor', descriptor.ref()], ['/W', widths],
      ['/CIDSystemInfo', new PdfDict([['/Registry', new PdfString(registry)], ['/Ordering', new PdfString(ordering)], ['/Supplement', new PdfNum(supplement)]])]
    ]);
    return new PdfDict([
      ['/Type', new PdfName('/Font')], ['/Subtype', new PdfName('/Type0')], ['/BaseFont', new PdfName(`/${this.fontName}`)],
      ['/Encoding', new PdfObjectStream(document, encodeLatin1(encoding)).ref()],
      ['/DescendantFonts', new PdfArray([descendant])],
      ['/ToUnicode', new PdfObjectStream(document, encodeLatin1(fontCmap(this.cmap, this.protect))).ref()]
    ]);
  }
}

/** CP1252 decoding is derived from the existing encoder rather than a second table. */
function winAnsiRune(byte: number): number {
  return WIN_ANSI_RUNES[byte] ?? 0x3f;
}
const WIN_ANSI_RUNES = Array.from({ length: 256 }, (_, byte) => byte);
for (let rune = 256; rune <= 0x2122; rune++) {
  const byte = toWinAnsiByte(rune);
  if (byte !== 0x3f) WIN_ANSI_RUNES[byte] = rune;
}

/** CMaps for full-program paths, with bounded blocks and UTF-16BE destinations. */
function fontCmap(values: readonly number[], protect = false, cid = false, simple = false, ros = { registry: 'Adobe', ordering: 'Identity', supplement: 0 }): string {
  const hex = (n: number): string => n.toString(16).toUpperCase().padStart(4, '0');
  let result = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n'
    + `/CIDSystemInfo << /Registry ${pdfLiteral(ros.registry)} /Ordering ${pdfLiteral(ros.ordering)} /Supplement ${ros.supplement} >> def\n`
    + `/CMapName /JsPdf${cid ? 'Encoding' : 'Unicode'} def\n/CMapType ${cid ? 1 : 2} def\n`
    + (cid ? '/WMode 0 def\n' : '')
    + `1 begincodespacerange\n<${simple ? '00> <FF' : '0000> <FFFF'}>\nendcodespacerange\n`;
  for (let start = 0; start < values.length; start += 100) {
    const end = Math.min(start + 100, values.length);
    result += `${end - start} begin${cid ? 'cid' : 'bf'}char\n`;
    for (let index = start; index < end; index++) {
      const rune = protect && index !== 0 ? 32 : values[index]!;
      const destination = rune <= 0xffff ? hex(rune) : hex(0xd800 + ((rune - 0x10000) >> 10)) + hex(0xdc00 + ((rune - 0x10000) & 1023));
      result += `<${simple ? index.toString(16).padStart(2, '0') : hex(index)}> ${cid ? rune : '<' + destination + '>'}\n`;
    }
    result += `end${cid ? 'cid' : 'bf'}char\n`;
  }
  return result + 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend';
}
