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
 *   - pdf/lib/src/pdf/font/ttf_parser.dart
 *
 * Reads a TrueType/OpenType file out of a byte array the caller already has.
 * Nothing here fetches or decodes anything from a host: the parser walks the
 * table directory with a data view and slices glyph programs as subarrays.
 *
 * Upstream asserts its way through malformed input, which is a no-op in a Dart
 * release build. The port throws instead when a required table is missing or
 * the table directory is unreadable — a font like that is one the rest of
 * phase 1 cannot subset or embed, so failing at parse time is where the error
 * is cheapest to understand. A malformed or truncated `cmap` subtable is the
 * exception: it is skipped, because the font's other subtables usually cover
 * the same characters and the fallback font covers the rest.
 *
 * Arabic isolated presentation forms are aliased to the basic glyph when a
 * font omits the duplicate cmap entries, matching upstream's bidi coupling.
 */

import { basicToIsolatedMappings } from './bidi_utils.ts';
import { PdfFontMetrics } from './font_metrics.ts';

/** `name` table name IDs, upstream's `TtfParserName` enum. */
export const TtfParserName = Object.freeze({
  copyright: 0,
  fontFamily: 1,
  fontSubfamily: 2,
  uniqueID: 3,
  fullName: 4,
  version: 5,
  postScriptName: 6,
  trademark: 7,
  manufacturer: 8,
  designer: 9,
  description: 10,
  manufacturerURL: 11,
  designerURL: 12,
  license: 13,
  licenseURL: 14,
  reserved: 15,
  preferredFamily: 16,
  preferredSubfamily: 17,
  compatibleFullName: 18,
  sampleText: 19,
  postScriptFindFontName: 20,
  wwsFamily: 21,
  wwsSubfamily: 22
});

export const TtfTable = Object.freeze({
  head: 'head',
  name: 'name',
  hmtx: 'hmtx',
  hhea: 'hhea',
  cmap: 'cmap',
  maxp: 'maxp',
  loca: 'loca',
  glyf: 'glyf',
  post: 'post',
  os2: 'OS/2',
  cff: 'CFF ',
  cblc: 'CBLC',
  cbdt: 'CBDT'
});

/** One glyph's program, plus the glyphs a composite glyph refers to. */
export interface TtfGlyphInfo {
  readonly index: number;
  readonly data: Uint8Array;
  readonly compounds: readonly number[];
}

/** A PNG bitmap glyph and the strike metrics needed to align it with text. */
export class TtfBitmapInfo {
  readonly data: Uint8Array;
  readonly height: number;
  readonly width: number;
  readonly horizontalBearingX: number;
  readonly horizontalBearingY: number;
  readonly horizontalAdvance: number;
  readonly ascent: number;
  readonly descent: number;

  constructor(
    data: Uint8Array,
    height: number,
    width: number,
    horizontalBearingX: number,
    horizontalBearingY: number,
    horizontalAdvance: number,
    ascent: number,
    descent: number
  ) {
    this.data = data;
    this.height = height;
    this.width = width;
    this.horizontalBearingX = horizontalBearingX;
    this.horizontalBearingY = horizontalBearingY;
    this.horizontalAdvance = horizontalAdvance;
    this.ascent = ascent;
    this.descent = descent;
  }

  get metrics(): PdfFontMetrics {
    const scale = 1 / this.height;
    return new PdfFontMetrics({
      bottom: this.horizontalBearingY * scale,
      left: this.horizontalBearingX * scale,
      top: (this.horizontalBearingY - this.height) * scale,
      right: this.horizontalAdvance * scale,
      ascent: this.ascent * scale,
      descent: this.horizontalBearingY * scale,
      advanceWidth: this.horizontalAdvance * scale,
      leftBearing: this.horizontalBearingX * scale
    });
  }
}

const REQUIRED_TABLES = [
  TtfTable.head,
  TtfTable.name,
  TtfTable.hmtx,
  TtfTable.hhea,
  TtfTable.cmap,
  TtfTable.maxp
];

export class TtfParser {
  readonly bytes: Uint8Array;
  private readonly view: DataView;

  readonly tableOffsets = new Map<string, number>();
  readonly tableSize = new Map<string, number>();

  /** Unicode code point to glyph index, from the ranked `cmap` subtables. */
  readonly charToGlyphIndexMap = new Map<number, number>();

  readonly glyphOffsets: number[] = [];
  readonly glyphSizes: number[] = [];
  readonly glyphInfoMap = new Map<number, PdfFontMetrics>();
  readonly bitmapInfoMap = new Map<number, TtfBitmapInfo>();

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    const numTables = this.view.getUint16(4);
    for (let i = 0; i < numTables; i++) {
      const name = this.readTag(i * 16 + 12);
      this.tableOffsets.set(name, this.view.getUint32(i * 16 + 20));
      this.tableSize.set(name, this.view.getUint32(i * 16 + 24));
    }

    for (const table of REQUIRED_TABLES) {
      if (!this.tableOffsets.has(table)) {
        throw new TypeError(
          `Unable to find the \`${table}\` table. This file is not a supported TTF font`
        );
      }
    }

    this.parseCMap();

    if (this.tableOffsets.has(TtfTable.loca) && this.tableOffsets.has(TtfTable.glyf)) {
      this.parseIndexes();
      this.parseGlyphs();
    }
    if (this.hasCff) this.parseCffMetrics();
    if (this.tableOffsets.has(TtfTable.cblc) && this.tableOffsets.has(TtfTable.cbdt)) {
      this.parseBitmaps();
    }
  }

  /** A four-byte ASCII table tag. */
  private readTag(offset: number): string {
    let tag = '';
    for (let i = 0; i < 4; i++) {
      tag += String.fromCharCode(this.bytes[offset + i] ?? 0);
    }
    return tag;
  }

  private tableOffset(name: string): number {
    const offset = this.tableOffsets.get(name);
    if (offset === undefined) {
      throw new TypeError(`This font has no \`${name}\` table`);
    }
    return offset;
  }

  get unitsPerEm(): number {
    return this.view.getUint16(this.tableOffset(TtfTable.head) + 18);
  }

  get xMin(): number {
    return this.view.getInt16(this.tableOffset(TtfTable.head) + 36);
  }

  get yMin(): number {
    return this.view.getInt16(this.tableOffset(TtfTable.head) + 38);
  }

  get xMax(): number {
    return this.view.getInt16(this.tableOffset(TtfTable.head) + 40);
  }

  get yMax(): number {
    return this.view.getInt16(this.tableOffset(TtfTable.head) + 42);
  }

  get indexToLocFormat(): number {
    return this.view.getInt16(this.tableOffset(TtfTable.head) + 50);
  }

  get ascent(): number {
    return this.view.getInt16(this.tableOffset(TtfTable.hhea) + 4);
  }

  get descent(): number {
    return this.view.getInt16(this.tableOffset(TtfTable.hhea) + 6);
  }

  get lineGap(): number {
    return this.view.getInt16(this.tableOffset(TtfTable.hhea) + 8);
  }

  get numOfLongHorMetrics(): number {
    return this.view.getUint16(this.tableOffset(TtfTable.hhea) + 34);
  }

  get numGlyphs(): number {
    return this.view.getUint16(this.tableOffset(TtfTable.maxp) + 4);
  }

  /** The PostScript name, which is what `/BaseFont` gets in phase 1.3. */
  get fontName(): string {
    return this.getNameID(TtfParserName.postScriptName) ?? 'UnnamedFont';
  }

  get unicode(): boolean {
    return this.view.getUint32(0) === 0x10000;
  }

  /**
   * True for an OpenType font with PostScript outlines. Those have no
   * `glyf`/`loca` to subset, so phase 1.2 has to embed them whole.
   */
  get hasCff(): boolean {
    return this.tableOffsets.has(TtfTable.cff);
  }

  get isBitmap(): boolean {
    return this.bitmapInfoMap.size > 0 && this.glyphOffsets.length === 0;
  }

  getBitmap(codePoint: number): TtfBitmapInfo | null {
    const glyph = this.charToGlyphIndexMap.get(codePoint);
    return glyph === undefined ? null : (this.bitmapInfoMap.get(glyph) ?? null);
  }

  /** https://developer.apple.com/fonts/TrueType-Reference-Manual/RM06/Chap6name.html */
  getNameID(nameID: number): string | null {
    const basePosition = this.tableOffsets.get(TtfTable.name);
    if (basePosition === undefined) {
      return null;
    }

    const count = this.view.getUint16(basePosition + 2);
    const stringOffset = this.view.getUint16(basePosition + 4);
    let pos = basePosition + 6;
    let macintoshName: string | null = null;

    for (let i = 0; i < count; i++) {
      const platformID = this.view.getUint16(pos);
      const id = this.view.getUint16(pos + 6);
      const length = this.view.getUint16(pos + 8);
      const offset = this.view.getUint16(pos + 10);
      pos += 12;

      if (id !== nameID) {
        continue;
      }

      const start = basePosition + stringOffset + offset;
      if (start + length > this.bytes.length) {
        continue;
      }

      // Platform 3 (Windows) is UTF-16BE and wins outright; platform 1
      // (Macintosh) is a single-byte encoding, kept only as a fallback.
      if (platformID === 3) {
        return decodeUtf16Be(this.bytes.subarray(start, start + length));
      }

      if (platformID === 1) {
        macintoshName = decodeLatin1(this.bytes.subarray(start, start + length));
      }
    }

    return macintoshName;
  }

  /**
   * The character map, from the subtables whose keys are Unicode.
   *
   * Upstream merged every subtable it understood, in record order, but a Mac
   * Roman (1,0) subtable is keyed by Mac Roman bytes and a symbol (3,0) one by
   * 0xF0xx codes, while everything downstream reads the map as Unicode. Each
   * subtable is ranked instead. The Unicode ones are merged weakest first, so
   * the strongest wins a conflict and a weaker one only adds coverage; a symbol
   * or Mac Roman subtable is read only when the font has no Unicode one.
   * PR #1980 picks the single best subtable; merging the Unicode ones keeps any
   * coverage a font splits across them.
   */
  private parseCMap(): void {
    const base = this.tableOffset(TtfTable.cmap);
    const map = this.charToGlyphIndexMap;
    const records = Math.min(this.view.getUint16(base + 2), (this.bytes.length - base - 4) >> 3);
    const subtables: [rank: number, start: number][] = [];

    for (let i = 0; i < records; i++) {
      const record = base + 4 + i * 8;
      const start = base + this.view.getUint32(record + 4);
      const rank = start + 2 <= this.bytes.length
        ? cmapRank(this.view.getUint16(record), this.view.getUint16(record + 2), this.view.getUint16(start))
        : 0;
      if (rank > 0) subtables.push([rank, start]);
    }

    const best = Math.max(0, ...subtables.map(([rank]) => rank));
    // Array sort is stable, so equally ranked subtables keep record order.
    for (const [, start] of subtables.filter(([rank]) => (best > 2 ? rank > 2 : rank === best))
      .sort((a, b) => a[0] - b[0])) {
      this.parseCMapSubtable(start);
    }

    if (best === 2) {
      // A symbol font keys its glyphs at 0xF000 plus the byte; the bare byte is
      // registered too, so `drawString('A')` finds U+F041. A real entry wins.
      for (const [code, glyph] of map) {
        if (code >= 0xf000 && code <= 0xf0ff && !map.has(code & 0xff)) map.set(code & 0xff, glyph);
      }
    } else if (best === 1) {
      // The low half of Mac Roman is ASCII; the high half is not Unicode, and
      // upstream's remapping table is not worth carrying for a last resort.
      for (const code of map.keys()) if (code >= 0x80) map.delete(code);
    }

    for (const [basic, isolated] of basicToIsolatedMappings) {
      const glyph = map.get(basic);
      if (glyph !== undefined && !map.has(isolated)) {
        map.set(isolated, glyph);
      }
    }
  }

  /**
   * One subtable, `start` pointing at its format field. Every array is
   * bounds-checked against the file before it is read, so a truncated subtable
   * is skipped whole rather than throwing; upstream asserts, or reads past the
   * table. Glyph 0 is `.notdef`, never coverage, in every format: recording it
   * would make `isRuneSupported` true and skip the fallback font.
   */
  private parseCMapSubtable(start: number): void {
    const view = this.view;
    const map = this.charToGlyphIndexMap;
    const length = this.bytes.length;
    const fits = (end: number): boolean => end <= length;

    switch (view.getUint16(start)) {
      case 0:
        // format, length and language precede the array, so it starts at +6.
        // Upstream read it at +4, which put each code on the glyph of the code
        // two after it.
        if (!fits(start + 262)) return;
        for (let code = 0; code < 256; code++) {
          const glyph = view.getUint8(start + 6 + code);
          if (glyph > 0) map.set(code, glyph);
        }
        return;
      case 4: {
        if (!fits(start + 14)) return;
        const segments = view.getUint16(start + 6) >> 1;
        const ends = start + 14;
        const starts = ends + segments * 2 + 2;
        const deltas = starts + segments * 2;
        const ranges = deltas + segments * 2;
        if (!fits(ranges + segments * 2)) return;

        // The last segment is the mandatory 0xFFFF terminator.
        for (let s = 0; s < segments - 1; s++) {
          const end = view.getUint16(ends + s * 2);
          const first = view.getUint16(starts + s * 2);
          const delta = view.getUint16(deltas + s * 2);
          const range = view.getUint16(ranges + s * 2);

          for (let code = first; code <= end; code++) {
            let glyph = (code + delta) & 0xffff;
            if (range !== 0) {
              const address = ranges + s * 2 + range + 2 * (code - first);
              if (!fits(address + 2)) continue;
              glyph = view.getUint16(address);
              // idDelta applies to an array lookup too; upstream ignored it.
              if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
            }
            if (glyph !== 0) map.set(code, glyph);
          }
        }
        return;
      }
      case 6: {
        if (!fits(start + 10)) return;
        const first = view.getUint16(start + 6);
        const count = view.getUint16(start + 8);
        if (!fits(start + 10 + count * 2)) return;
        for (let i = 0; i < count; i++) {
          const glyph = view.getUint16(start + 10 + i * 2);
          if (glyph > 0) map.set(first + i, glyph);
        }
        return;
      }
      case 12: {
        if (!fits(start + 16)) return;
        const groups = view.getUint32(start + 12);
        if (!fits(start + 16 + groups * 12)) return;
        for (let i = 0; i < groups; i++) {
          const group = start + 16 + i * 12;
          const first = view.getUint32(group);
          const end = view.getUint32(group + 4);
          const glyph = view.getUint32(group + 8) - first;
          // A group past the last code point is corrupt, and could run for 2^32
          // iterations.
          if (end > 0x10ffff) continue;
          for (let code = first; code <= end; code++) {
            if (glyph + code !== 0) map.set(code, glyph + code);
          }
        }
      }
    }
  }

  /**
   * `loca` holds `numGlyphs + 1` offsets into `glyf`; each glyph's size is the
   * gap to the next one, and a zero-length gap means a blank glyph such as
   * space.
   */
  private parseIndexes(): void {
    const basePosition = this.tableOffset(TtfTable.loca);
    const shortFormat = this.indexToLocFormat === 0;

    let prevOffset = shortFormat
      ? this.view.getUint16(basePosition) * 2
      : this.view.getUint32(basePosition);

    for (let i = 1; i < this.numGlyphs + 1; i++) {
      const offset = shortFormat
        ? this.view.getUint16(basePosition + i * 2) * 2
        : this.view.getUint32(basePosition + i * 4);

      this.glyphOffsets.push(prevOffset);
      this.glyphSizes.push(offset - prevOffset);
      prevOffset = offset;
    }
  }

  /**
   * Per-glyph metrics, normalized to em units so a caller never divides by
   * `unitsPerEm` again.
   *
   * `top` takes `yMin` and `bottom` takes `yMax`, which reads inverted and is
   * upstream's assignment: `PdfFontMetrics` is in PDF space, where y grows
   * upward.
   *
   * https://developer.apple.com/fonts/TrueType-Reference-Manual/RM06/Chap6glyf.html
   */
  /** CFF advances come from hmtx; use em bounds without interpreting charstrings. */
  private parseCffMetrics(): void {
    const offset = this.tableOffset(TtfTable.hmtx), count = this.numOfLongHorMetrics;
    if (count < 1 || count > this.numGlyphs) throw new TypeError('Invalid CFF horizontal metrics');
    for (let glyph = 0; glyph < this.numGlyphs; glyph++) {
      const advance = this.view.getUint16(offset + Math.min(glyph, count - 1) * 4) / this.unitsPerEm;
      const left = this.view.getInt16(glyph < count ? offset + glyph * 4 + 2 : offset + count * 4 + (glyph - count) * 2) / this.unitsPerEm;
      this.glyphInfoMap.set(glyph, new PdfFontMetrics({ left, right: left + advance,
        top: this.descent / this.unitsPerEm, bottom: this.ascent / this.unitsPerEm,
        ascent: this.ascent / this.unitsPerEm, descent: this.descent / this.unitsPerEm,
        advanceWidth: advance, leftBearing: left }));
    }
  }

  private parseGlyphs(): void {
    const baseOffset = this.tableOffset(TtfTable.glyf);
    const hmtxOffset = this.tableOffset(TtfTable.hmtx);
    const unitsPerEm = this.unitsPerEm;
    const numOfLongHorMetrics = this.numOfLongHorMetrics;
    const ascent = this.ascent;
    const descent = this.descent;
    const defaultAdvanceWidth = this.view.getUint16(hmtxOffset + (numOfLongHorMetrics - 1) * 4);

    for (let glyphIndex = 0; glyphIndex < this.numGlyphs; glyphIndex++) {
      const advanceWidth = glyphIndex < numOfLongHorMetrics
        ? this.view.getUint16(hmtxOffset + glyphIndex * 4)
        : defaultAdvanceWidth;

      const leftBearing = glyphIndex < numOfLongHorMetrics
        ? this.view.getInt16(hmtxOffset + glyphIndex * 4 + 2)
        : this.view.getInt16(
          hmtxOffset + numOfLongHorMetrics * 4 + (glyphIndex - numOfLongHorMetrics) * 2
        );

      if (this.glyphSizes[glyphIndex] === 0) {
        this.glyphInfoMap.set(glyphIndex, new PdfFontMetrics({
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          ascent: 0,
          descent: 0,
          advanceWidth: advanceWidth / unitsPerEm,
          leftBearing: leftBearing / unitsPerEm
        }));
        continue;
      }

      const offset = baseOffset + (this.glyphOffsets[glyphIndex] as number);

      this.glyphInfoMap.set(glyphIndex, new PdfFontMetrics({
        left: this.view.getInt16(offset + 2) / unitsPerEm,
        top: this.view.getInt16(offset + 4) / unitsPerEm,
        right: this.view.getInt16(offset + 6) / unitsPerEm,
        bottom: this.view.getInt16(offset + 8) / unitsPerEm,
        ascent: ascent / unitsPerEm,
        descent: descent / unitsPerEm,
        advanceWidth: advanceWidth / unitsPerEm,
        leftBearing: leftBearing / unitsPerEm
      }));
    }
  }

  /**
   * The raw glyph program, sliced out of `glyf` — this is what phase 1.2 copies
   * into a subset. A composite glyph reports the glyphs it is built from, which
   * the subset has to pull in as well.
   *
   * http://stevehanov.ca/blog/?id=143
   */
  readGlyph(index: number): TtfGlyphInfo {
    if (index < 0 || index >= this.glyphOffsets.length) {
      throw new RangeError(`Glyph ${index} is outside this font's ${this.glyphOffsets.length} glyphs`);
    }

    const glyfOffset = this.tableOffset(TtfTable.glyf);
    const start = glyfOffset + (this.glyphOffsets[index] as number);
    const glyfEnd = glyfOffset + (this.tableSize.get(TtfTable.glyf) ?? 0);

    // A negative size is a malformed `loca`; read it as empty, like a blank.
    if (start >= glyfEnd || start === 0 || (this.glyphSizes[index] as number) <= 0) {
      return { index, data: new Uint8Array(0), compounds: [] };
    }

    const numberOfContours = this.view.getInt16(start);

    return numberOfContours === -1
      ? this.readCompoundGlyph(index, start, start + 10)
      : this.readSimpleGlyph(index, start, start + 10, numberOfContours);
  }

  /**
   * A glyph's bytes, never more than `loca` declares for it, so a malformed
   * `loca` cannot hand back the start of the neighbouring outline.
   */
  private glyphBytes(glyph: number, start: number, end: number): Uint8Array {
    return this.bytes.subarray(start, Math.min(end, start + (this.glyphSizes[glyph] as number)));
  }

  private readSimpleGlyph(
    glyph: number,
    start: number,
    offset: number,
    numberOfContours: number
  ): TtfGlyphInfo {
    const xIsByte = 2;
    const yIsByte = 4;
    const repeat = 8;
    const xDelta = 16;
    const yDelta = 32;

    let numPoints = 1;
    for (let i = 0; i < numberOfContours; i++) {
      numPoints = Math.max(numPoints, this.view.getUint16(offset) + 1);
      offset += 2;
    }

    // Skip the instruction stream; a subset keeps the bytes but never runs them.
    offset += this.view.getUint16(offset) + 2;

    if (numberOfContours === 0) {
      return { index: glyph, data: this.glyphBytes(glyph, start, offset), compounds: [] };
    }

    const flags: number[] = [];
    for (let i = 0; i < numPoints; i++) {
      const flag = this.view.getUint8(offset++);
      flags.push(flag);

      if ((flag & repeat) !== 0) {
        let repeatCount = this.view.getUint8(offset++);
        i += repeatCount;
        while (repeatCount-- > 0) {
          flags.push(flag);
        }
      }
    }

    // Two passes, x then y: a coordinate is one byte, two bytes, or absent
    // because it repeats the previous one.
    let byteFlag = xIsByte;
    let deltaFlag = xDelta;
    for (let a = 0; a < 2; a++) {
      for (let i = 0; i < numPoints; i++) {
        const flag = flags[i] as number;
        if ((flag & byteFlag) !== 0) {
          offset++;
        } else if ((~flag & deltaFlag) !== 0) {
          offset += 2;
        }
      }
      byteFlag = yIsByte;
      deltaFlag = yDelta;
    }

    return { index: glyph, data: this.glyphBytes(glyph, start, offset), compounds: [] };
  }

  private readCompoundGlyph(glyph: number, start: number, offset: number): TtfGlyphInfo {
    const arg1And2AreWords = 0x0001;
    const hasScale = 0x0008;
    const moreComponents = 0x0020;
    const hasXYScale = 0x0040;
    const hasTransformationMatrix = 0x0080;
    const weHaveInstructions = 0x0100;

    const components: number[] = [];
    let hasInstructions = false;
    let flags = moreComponents;

    while ((flags & moreComponents) !== 0) {
      flags = this.view.getUint16(offset);
      components.push(this.view.getUint16(offset + 2));
      offset += (flags & arg1And2AreWords) !== 0 ? 8 : 6;

      if ((flags & hasScale) !== 0) {
        offset += 2;
      } else if ((flags & hasXYScale) !== 0) {
        offset += 4;
      } else if ((flags & hasTransformationMatrix) !== 0) {
        offset += 8;
      }

      if ((flags & weHaveInstructions) !== 0) {
        hasInstructions = true;
      }
    }

    if (hasInstructions) {
      offset += this.view.getUint16(offset) + 2;
    }

    return { index: glyph, data: this.glyphBytes(glyph, start, offset), compounds: components };
  }

  /** Parse PNG-backed bitmap strikes, matching upstream's CBLC format-1 path. */
  private parseBitmaps(): void {
    const cblc = this.tableOffset(TtfTable.cblc);
    const cbdt = this.tableOffset(TtfTable.cbdt);
    const numberOfSizes = this.view.getUint32(cblc + 4);
    let sizeOffset = cblc + 8;

    for (let sizeIndex = 0; sizeIndex < numberOfSizes; sizeIndex++) {
      const subtableArray = cblc + this.view.getUint32(sizeOffset);
      const numberOfSubtables = this.view.getUint32(sizeOffset + 8);
      const ascent = this.view.getInt8(sizeOffset + 12);
      const descent = this.view.getInt8(sizeOffset + 13);
      let arrayOffset = subtableArray;

      for (let tableIndex = 0; tableIndex < numberOfSubtables; tableIndex++) {
        const firstGlyph = this.view.getUint16(arrayOffset);
        const lastGlyph = this.view.getUint16(arrayOffset + 2);
        const subtable = subtableArray + this.view.getUint32(arrayOffset + 4);
        const indexFormat = this.view.getUint16(subtable);
        const imageFormat = this.view.getUint16(subtable + 2);
        const imageData = cbdt + this.view.getUint32(subtable + 4);

        if (indexFormat === 1 && imageFormat === 17) {
          for (let glyph = firstGlyph; glyph <= lastGlyph; glyph++) {
            const offsetIndex = glyph - firstGlyph;
            const bitmap = imageData + this.view.getUint32(subtable + 8 + offsetIndex * 4);
            const height = this.view.getUint8(bitmap);
            const width = this.view.getUint8(bitmap + 1);
            const bearingX = this.view.getInt8(bitmap + 2);
            const bearingY = this.view.getInt8(bitmap + 3);
            const advance = this.view.getUint8(bitmap + 4);
            const dataLength = this.view.getUint32(bitmap + 5);
            const dataStart = bitmap + 9;
            const dataEnd = dataStart + dataLength;

            if (height > 0 && width > 0 && dataEnd <= this.bytes.length) {
              this.bitmapInfoMap.set(glyph, new TtfBitmapInfo(
                this.bytes.subarray(dataStart, dataEnd),
                height,
                width,
                bearingX,
                bearingY,
                advance,
                ascent,
                descent
              ));
            }
          }
        }

        arrayOffset += 8;
      }
      sizeOffset += 48;
    }
  }
}

/**
 * How much a cmap subtable is preferred; 0 means it is not read. Above 2 the
 * keys are Unicode: (3,10) full repertoire, then (0,4) and (0,6), then (3,1)
 * BMP, then any other (0,x). 2 is Windows symbol and 1 is Mac Roman. Formats 2,
 * 8, 10, 13 and 14 are not understood.
 */
function cmapRank(platform: number, encoding: number, format: number): number {
  if (format !== 0 && format !== 4 && format !== 6 && format !== 12) return 0;
  if (platform === 0) return encoding === 4 || encoding === 6 ? 5 : 3;
  if (platform === 3) return encoding === 10 ? 6 : encoding === 1 ? 4 : encoding === 0 ? 2 : 0;
  return platform === 1 && encoding === 0 ? 1 : 0;
}

/** UTF-16BE, the `name` table's Windows encoding. No host decoder exists. */
function decodeUtf16Be(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    text += String.fromCharCode(((bytes[i] as number) << 8) | (bytes[i + 1] as number));
  }
  return text;
}

function decodeLatin1(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) {
    text += String.fromCharCode(byte);
  }
  return text;
}
