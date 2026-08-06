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
 * release build. The port throws instead — a font that fails these checks is one
 * the rest of phase 1 cannot subset or embed, so failing at parse time is where
 * the error is cheapest to understand.
 *
 * PORT GAP: no bitmap glyphs. Upstream parses `CBLC`/`CBDT` for colour emoji
 * fonts; that is a separate feature from the outline path phase 1 needs, and it
 * pulls in a whole second metrics shape.
 *
 * PORT GAP: no bidi coupling. Upstream's format 4 reader also maps each Arabic
 * codepoint's isolated form to the same glyph, guarded by a global option. That
 * belongs with `font/arabic.dart` and `bidi_utils.dart`, which are unported.
 */

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
  cff: 'CFF '
});

/** One glyph's program, plus the glyphs a composite glyph refers to. */
export interface TtfGlyphInfo {
  readonly index: number;
  readonly data: Uint8Array;
  readonly compounds: readonly number[];
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

  /** Codepoint to glyph index, built from every `cmap` subtable understood. */
  readonly charToGlyphIndexMap = new Map<number, number>();

  readonly glyphOffsets: number[] = [];
  readonly glyphSizes: number[] = [];
  readonly glyphInfoMap = new Map<number, PdfFontMetrics>();

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

  private parseCMap(): void {
    const basePosition = this.tableOffset(TtfTable.cmap);
    const numSubTables = this.view.getUint16(basePosition + 2);

    for (let i = 0; i < numSubTables; i++) {
      const offset = this.view.getUint32(basePosition + i * 8 + 8);
      const format = this.view.getUint16(basePosition + offset);

      switch (format) {
        case 0:
          this.parseCMapFormat0(basePosition + offset + 2);
          break;
        case 4:
          this.parseCMapFormat4(basePosition + offset + 2);
          break;
        case 6:
          this.parseCMapFormat6(basePosition + offset + 2);
          break;
        case 12:
          this.parseCMapFormat12(basePosition + offset + 2);
          break;
        default:
          // Formats 2, 8, 10, 13 and 14 are not understood. Skipping a subtable
          // is safe: another one in the same table normally covers the range.
          break;
      }
    }
  }

  private parseCMapFormat0(basePosition: number): void {
    for (let i = 0; i < 256; i++) {
      const glyphIndex = this.view.getUint8(basePosition + i + 2);
      if (glyphIndex > 0) {
        this.charToGlyphIndexMap.set(i, glyphIndex);
      }
    }
  }

  private parseCMapFormat4(basePosition: number): void {
    const segCount = Math.floor(this.view.getUint16(basePosition + 4) / 2);

    const endCodes: number[] = [];
    for (let i = 0; i < segCount; i++) {
      endCodes.push(this.view.getUint16(basePosition + i * 2 + 12));
    }

    const startCodes: number[] = [];
    for (let i = 0; i < segCount; i++) {
      startCodes.push(this.view.getUint16(basePosition + (segCount + i) * 2 + 14));
    }

    const idDeltas: number[] = [];
    for (let i = 0; i < segCount; i++) {
      idDeltas.push(this.view.getUint16(basePosition + (segCount * 2 + i) * 2 + 14));
    }

    const idRangeOffsetBasePos = basePosition + segCount * 6 + 14;
    const idRangeOffsets: number[] = [];
    for (let i = 0; i < segCount; i++) {
      idRangeOffsets.push(this.view.getUint16(idRangeOffsetBasePos + i * 2));
    }

    for (let s = 0; s < segCount - 1; s++) {
      const startCode = startCodes[s] as number;
      const endCode = endCodes[s] as number;
      const idDelta = idDeltas[s] as number;
      const idRangeOffset = idRangeOffsets[s] as number;
      const idRangeOffsetAddress = idRangeOffsetBasePos + s * 2;

      for (let c = startCode; c <= endCode; c++) {
        let glyphIndex: number;

        if (idRangeOffset === 0) {
          glyphIndex = (idDelta + c) % 65536;
        } else {
          const glyphIndexAddress = idRangeOffset + 2 * (c - startCode) + idRangeOffsetAddress;
          if (glyphIndexAddress + 1 >= this.bytes.length) {
            continue;
          }
          glyphIndex = this.view.getUint16(glyphIndexAddress);
        }

        this.charToGlyphIndexMap.set(c, glyphIndex);
      }
    }
  }

  private parseCMapFormat6(basePosition: number): void {
    const firstCode = this.view.getUint16(basePosition + 4);
    const entryCount = this.view.getUint16(basePosition + 6);

    for (let i = 0; i < entryCount; i++) {
      const glyphIndex = this.view.getUint16(basePosition + i * 2 + 8);
      if (glyphIndex > 0) {
        this.charToGlyphIndexMap.set(firstCode + i, glyphIndex);
      }
    }
  }

  private parseCMapFormat12(basePosition: number): void {
    const numGroups = this.view.getUint32(basePosition + 10);

    for (let i = 0; i < numGroups; i++) {
      const startCharCode = this.view.getUint32(basePosition + i * 12 + 14);
      const endCharCode = this.view.getUint32(basePosition + i * 12 + 18);
      const startGlyphID = this.view.getUint32(basePosition + i * 12 + 22);

      for (let j = startCharCode; j <= endCharCode; j++) {
        this.charToGlyphIndexMap.set(j, startGlyphID + j - startCharCode);
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

    if (start >= glyfEnd || start === 0 || this.glyphSizes[index] === 0) {
      return { index, data: new Uint8Array(0), compounds: [] };
    }

    const numberOfContours = this.view.getInt16(start);

    return numberOfContours === -1
      ? this.readCompoundGlyph(index, start, start + 10)
      : this.readSimpleGlyph(index, start, start + 10, numberOfContours);
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
      return { index: glyph, data: this.bytes.subarray(start, offset), compounds: [] };
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

    return { index: glyph, data: this.bytes.subarray(start, offset), compounds: [] };
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

    return { index: glyph, data: this.bytes.subarray(start, offset), compounds: components };
  }
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
