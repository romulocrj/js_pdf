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
 * PORT GAP: no simple `/TrueType` branch. Upstream falls back to a WinAnsi
 * single-byte font, embedding the file whole, when the sfnt version is not
 * 0x00010000. That branch is strictly narrower than this one and reintroduces
 * the ceiling phase 1 exists to remove, so the port rejects such a font instead.
 *
 * PORT GAP: no `CFF `-flavoured OpenType — see `font/ttf_writer.ts`.
 *
 * PORT GAP: no Arabic or bidi coupling. Upstream zeroes the advance width of a
 * diacritic when its shaping options are on; `font/arabic.dart` and
 * `bidi_utils.dart` are unported.
 */

import { PdfFontMetrics } from '../font/font_metrics.ts';
import type { PdfFont } from '../font/font.ts';
import { TtfParser } from '../font/ttf_parser.ts';
import { TtfWriter } from '../font/ttf_writer.ts';
import { PdfArray } from '../format/array.ts';
import { PdfDict } from '../format/dict.ts';
import { PdfName } from '../format/name.ts';
import { PdfNum } from '../format/num.ts';
import { pdfHexString, PdfString } from '../format/string.ts';
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
}

export class PdfTtfFont implements PdfFont {
  readonly font: TtfParser;
  readonly protect: boolean;

  /**
   * Code points in CID order: `cmap[cid]` is the rune drawn by CID `cid`. CID 0
   * is `.notdef`, as `/Identity-H` requires, so index 0 holds rune 0.
   */
  private readonly cmap: number[] = [0];
  private readonly cidByRune = new Map<number, number>([[0, 0]]);

  constructor(bytes: Uint8Array, { protect = false }: PdfTtfFontOptions = {}) {
    this.font = new TtfParser(bytes);
    this.protect = protect;

    if (this.font.hasCff) {
      throw new TypeError(
        `\`${this.font.fontName}\` has PostScript (CFF) outlines, which this port cannot subset`
      );
    }

    if (!this.font.unicode) {
      throw new TypeError(
        `\`${this.font.fontName}\` is not a 0x00010000 TrueType font, which this port requires to embed`
      );
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
    return this.font.charToGlyphIndexMap.has(codePoint);
  }

  /** Metrics in em units, so the caller scales by the font size. */
  glyphMetrics(codePoint: number): PdfFontMetrics {
    const glyph = this.font.charToGlyphIndexMap.get(codePoint);
    if (glyph === undefined) {
      return PdfFontMetrics.zero;
    }
    return this.font.glyphInfoMap.get(glyph) ?? PdfFontMetrics.zero;
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
    const cids: number[] = [];

    for (const character of String(text)) {
      const rune = character.codePointAt(0) ?? 0;
      let cid = this.cidByRune.get(rune);

      if (cid === undefined) {
        cid = this.cmap.length;
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
}
