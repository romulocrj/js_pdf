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
 *   - pdf/lib/src/pdf/font/ttf_writer.dart
 *
 * Builds a TrueType file holding only the glyphs a document actually drew,
 * which is what gets embedded as `/FontFile2`. The input is the list of code
 * points in CID order — index `i` of `chars` becomes glyph `i` of the subset,
 * which is what lets the embedded font declare `/CIDToGIDMap /Identity`.
 *
 * Everything is built into byte arrays the caller already owns; nothing here
 * compresses, hashes or reads a file.
 *
 * PORT GAP: no `CFF `-flavoured OpenType. Those carry PostScript outlines with
 * no `glyf`/`loca` to rebuild, so a subset has to be produced by a different
 * algorithm entirely. `PdfTtfFont` rejects such a font up front.
 *
 * Divergences from upstream, each marked at the site that makes it:
 *
 *   - `_updateCompoundGlyph` upstream advances 6 or 8 bytes per component and
 *     never skips the component's optional scale or 2x2 transform, even though
 *     its own `_readCompoundGlyph` does. The port skips them, because otherwise
 *     a composite with a scaled component has its remaining component indices
 *     rewritten at the wrong offsets and the subset does not re-parse.
 *   - Upstream indexes `tables` with `!` over a fixed list of ten names, so a
 *     font without `OS/2` throws when the directory is written. The port writes
 *     the tables it has.
 *   - Upstream requires a `post` table. The port synthesizes an empty one, since
 *     the version it writes (3.0) declares "no glyph names" anyway.
 *   - Glyph traversal is guarded against a composite that reaches itself.
 *     Upstream recurses unconditionally.
 *   - Upstream drops a code point the font cannot draw and substitutes an
 *     arbitrary glyph for a repeated one, either of which shifts every later
 *     CID onto the wrong glyph. The port keeps the list aligned; see `place`.
 */

import { TtfParser, TtfTable } from './ttf_parser.ts';

/** A glyph program the subset owns, so compound indices can be rewritten. */
interface SubsetGlyph {
  readonly index: number;
  readonly data: Uint8Array;
  readonly compounds: readonly number[];

  /**
   * A blank glyph standing in for a code point the font cannot draw. It keeps
   * the CID-to-glyph identity intact and must never satisfy a composite's
   * reference to the real glyph of the same index.
   */
  readonly placeholder?: boolean;
}

/** Round up to the next multiple of `align`; every table starts word-aligned. */
function wordAlign(offset: number, align = 4): number {
  return offset + ((align - (offset % align)) % align);
}

/**
 * The TrueType table checksum: the sum of the table read as big-endian 32-bit
 * words, truncated to 32 bits. Callers pass a zero-padded table, so the tail
 * never needs special handling.
 */
function calcTableChecksum(table: Uint8Array): number {
  const view = new DataView(table.buffer, table.byteOffset, table.byteLength);
  let sum = 0;
  for (let i = 0; i < table.byteLength - 3; i += 4) {
    sum = (sum + view.getUint32(i)) >>> 0;
  }
  return sum;
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/**
 * Rewrite the glyph indices a composite glyph refers to, mapping each one to
 * its position in the subset.
 *
 * https://developer.apple.com/fonts/TrueType-Reference-Manual/RM06/Chap6glyf.html
 */
function updateCompoundGlyph(glyph: SubsetGlyph, compoundMap: ReadonlyMap<number, number>): void {
  const arg1And2AreWords = 0x0001;
  const hasScale = 0x0008;
  const moreComponents = 0x0020;
  const hasXYScale = 0x0040;
  const hasTransformationMatrix = 0x0080;

  const view = viewOf(glyph.data);
  let offset = 10;
  let flags = moreComponents;

  while ((flags & moreComponents) !== 0) {
    flags = view.getUint16(offset);
    const glyphIndex = view.getUint16(offset + 2);
    const mapped = compoundMap.get(glyphIndex);

    if (mapped === undefined || mapped < 0) {
      throw new TypeError(`Composite glyph ${glyph.index} refers to glyph ${glyphIndex}, which is not in the subset`);
    }

    view.setUint16(offset + 2, mapped);
    offset += (flags & arg1And2AreWords) !== 0 ? 8 : 6;

    // Upstream omits this; see the header. The component transform sits between
    // the arguments and the next component's flags.
    if ((flags & hasScale) !== 0) {
      offset += 2;
    } else if ((flags & hasXYScale) !== 0) {
      offset += 4;
    } else if ((flags & hasTransformationMatrix) !== 0) {
      offset += 8;
    }
  }
}

export class TtfWriter {
  readonly ttf: TtfParser;

  constructor(ttf: TtfParser) {
    this.ttf = ttf;
  }

  /**
   * A TrueType file containing the glyphs `chars` maps to, in that order, plus
   * every glyph their composites are built from.
   */
  withChars(chars: readonly number[]): Uint8Array {
    const ttf = this.ttf;
    const source = viewOf(ttf.bytes);
    const tables = new Map<string, Uint8Array>();
    const tablesLength = new Map<string, number>();

    const glyphsMap = new Map<number, SubsetGlyph>();
    const compounds = new Map<number, number>();
    const visited = new Set<number>();

    // Components are collected before the glyph that pulls them in, matching
    // upstream's post-order recursion — the insertion order of `glyphsMap` is
    // what orders the glyphs no character claimed.
    const addGlyph = (glyphIndex: number): void => {
      if (visited.has(glyphIndex)) {
        return;
      }
      visited.add(glyphIndex);

      const glyph = ttf.readGlyph(glyphIndex);
      for (const component of glyph.compounds) {
        compounds.set(component, -1);
        addGlyph(component);
      }

      glyphsMap.set(glyphIndex, {
        index: glyphIndex,
        data: glyph.data.slice(),
        compounds: glyph.compounds
      });
    };

    // `glyphsInfo[i]` is the glyph for `chars[i]`, for every `i` — that identity
    // is the whole point of the subset, because it is what lets the embedded
    // font declare `/CIDToGIDMap /Identity` and skip a mapping table.
    //
    // Upstream loses it in two cases, and both are reachable: a code point the
    // font has no glyph for is dropped, and a second code point resolving to an
    // already-used glyph takes an arbitrary other glyph. Either shifts every
    // later CID onto the wrong glyph. `MaterialIcons.ttf`, which the icon widget
    // needs in phase 5.4, has no space glyph and trips the first one. The port
    // emits a placeholder for the former and repeats the glyph for the latter.
    const glyphsInfo: SubsetGlyph[] = [];
    const placed = new Set<SubsetGlyph>();

    const place = (glyph: SubsetGlyph): void => {
      glyphsInfo.push(glyph);
      placed.add(glyph);
    };

    for (const char of chars) {
      // Space carries no outline: emitting it empty keeps `glyf` smaller and
      // matches what the original font stores for it anyway.
      if (char === 32) {
        const spaceIndex = ttf.charToGlyphIndexMap.get(32);
        place(spaceIndex === undefined
          ? { index: 0, data: new Uint8Array(0), compounds: [], placeholder: true }
          : { index: spaceIndex, data: new Uint8Array(0), compounds: [] });
        continue;
      }

      const glyphIndex = ttf.charToGlyphIndexMap.get(char) ?? 0;
      if (glyphIndex >= ttf.glyphOffsets.length) {
        place({ index: 0, data: new Uint8Array(0), compounds: [], placeholder: true });
        continue;
      }

      addGlyph(glyphIndex);
      const glyph = glyphsMap.get(glyphIndex);
      place(glyph ?? { index: glyphIndex, data: new Uint8Array(0), compounds: [], placeholder: true });
    }

    // Component glyphs no code point claimed, appended past the CID range.
    for (const glyph of glyphsMap.values()) {
      if (!placed.has(glyph)) {
        place(glyph);
      }
    }

    for (const compound of compounds.keys()) {
      const position = glyphsInfo.findIndex(glyph => !glyph.placeholder && glyph.index === compound);
      if (position < 0) {
        throw new TypeError(`Unable to find glyph ${compound} in the subset`);
      }
      compounds.set(compound, position);
    }

    // Two code points resolving to one glyph put the same object in the list
    // twice; rewriting its component indices twice would map them through the
    // table a second time.
    const rewritten = new Set<SubsetGlyph>();
    for (const glyph of glyphsInfo) {
      if (glyph.compounds.length > 0 && !rewritten.has(glyph)) {
        rewritten.add(glyph);
        updateCompoundGlyph(glyph, compounds);
      }
    }

    // glyf
    let glyphsTableLength = 0;
    for (const glyph of glyphsInfo) {
      glyphsTableLength = wordAlign(glyphsTableLength + glyph.data.length);
    }
    const glyphsTable = new Uint8Array(wordAlign(glyphsTableLength));
    tables.set(TtfTable.glyf, glyphsTable);
    tablesLength.set(TtfTable.glyf, glyphsTableLength);

    // loca — `numGlyphs + 1` offsets, halved when the head table says short.
    const shortLoca = ttf.indexToLocFormat === 0;
    const locaLength = (glyphsInfo.length + 1) * (shortLoca ? 2 : 4);
    const locaTable = new Uint8Array(wordAlign(locaLength));
    const locaView = viewOf(locaTable);
    tables.set(TtfTable.loca, locaTable);
    tablesLength.set(TtfTable.loca, locaLength);

    let glyphOffset = 0;
    let locaIndex = 0;
    for (const glyph of glyphsInfo) {
      if (shortLoca) {
        locaView.setUint16(locaIndex, glyphOffset / 2);
        locaIndex += 2;
      } else {
        locaView.setUint32(locaIndex, glyphOffset);
        locaIndex += 4;
      }
      glyphsTable.set(glyph.data, glyphOffset);
      glyphOffset = wordAlign(glyphOffset + glyph.data.length);
    }
    if (shortLoca) {
      locaView.setUint16(locaIndex, glyphOffset / 2);
    } else {
      locaView.setUint32(locaIndex, glyphOffset);
    }

    // Tables carried over verbatim, padded to a word boundary. The declared
    // length stays the real one; only the stored bytes are padded.
    for (const name of [TtfTable.head, TtfTable.maxp, TtfTable.hhea, TtfTable.os2]) {
      const start = ttf.tableOffsets.get(name);
      if (start === undefined) {
        continue;
      }
      const length = ttf.tableSize.get(name) ?? 0;
      const data = new Uint8Array(wordAlign(length));
      data.set(ttf.bytes.subarray(start, Math.min(start + data.length, ttf.bytes.length)));
      tables.set(name, data);
      tablesLength.set(name, length);
    }

    const head = tables.get(TtfTable.head);
    const maxp = tables.get(TtfTable.maxp);
    const hhea = tables.get(TtfTable.hhea);
    if (head === undefined || maxp === undefined || hhea === undefined) {
      throw new TypeError('This font has no `head`, `maxp` or `hhea` table and cannot be subset');
    }

    viewOf(head).setUint32(8, 0); // checkSumAdjustment, recomputed at the end
    viewOf(maxp).setUint16(4, glyphsInfo.length); // numGlyphs
    viewOf(hhea).setUint16(34, glyphsInfo.length); // numOfLongHorMetrics

    // post — version 3.0 declares that the font ships no glyph names, so only
    // the 32-byte header is needed and the name array is dropped entirely.
    {
      const length = 32;
      const data = new Uint8Array(wordAlign(length));
      const start = ttf.tableOffsets.get(TtfTable.post);
      if (start !== undefined) {
        data.set(ttf.bytes.subarray(start, Math.min(start + data.length, ttf.bytes.length)));
      }
      viewOf(data).setUint32(0, 0x00030000);
      tables.set(TtfTable.post, data);
      tablesLength.set(TtfTable.post, length);
    }

    // hmtx — one long metric per subset glyph, read from the original font at
    // the glyph's *original* index.
    {
      const length = 4 * glyphsInfo.length;
      const hmtx = new Uint8Array(wordAlign(length));
      const hmtxView = viewOf(hmtx);
      const hmtxOffset = ttf.tableOffsets.get(TtfTable.hmtx) ?? 0;
      const numOfLongHorMetrics = ttf.numOfLongHorMetrics;
      const defaultAdvanceWidth = source.getUint16(hmtxOffset + (numOfLongHorMetrics - 1) * 4);

      let index = 0;
      for (const glyph of glyphsInfo) {
        const advanceWidth = glyph.index < numOfLongHorMetrics
          ? source.getUint16(hmtxOffset + glyph.index * 4)
          : defaultAdvanceWidth;
        const leftBearing = glyph.index < numOfLongHorMetrics
          ? source.getInt16(hmtxOffset + glyph.index * 4 + 2)
          : source.getInt16(
            hmtxOffset + numOfLongHorMetrics * 4 + (glyph.index - numOfLongHorMetrics) * 2
          );

        hmtxView.setUint16(index, advanceWidth);
        hmtxView.setInt16(index + 2, leftBearing);
        index += 4;
      }

      tables.set(TtfTable.hmtx, hmtx);
      tablesLength.set(TtfTable.hmtx, length);
    }

    // cmap — a single format 12 group. The embedded font is addressed through
    // `/CIDToGIDMap /Identity`, so no reader consults this table; it exists
    // because the format requires a `cmap`. This is upstream's table verbatim.
    {
      const length = 40;
      const cmap = new Uint8Array(wordAlign(length));
      const cmapView = viewOf(cmap);
      cmapView.setUint16(0, 0); // table version
      cmapView.setUint16(2, 1); // number of encoding subtables
      cmapView.setUint16(4, 3); // platform id
      cmapView.setUint16(6, 10); // platform-specific encoding id
      cmapView.setUint32(8, 12); // offset from the start of the table
      cmapView.setUint16(12, 12); // subtable format
      cmapView.setUint32(16, 28); // subtable length
      cmapView.setUint32(20, 1); // language
      cmapView.setUint32(24, 1); // group count
      cmapView.setUint32(28, 32); // startCharCode
      cmapView.setUint32(32, chars.length + 31); // endCharCode
      cmapView.setUint32(36, 0); // startGlyphID

      tables.set(TtfTable.cmap, cmap);
      tablesLength.set(TtfTable.cmap, length);
    }

    // name — the subset carries no names; the PDF font dictionary is where the
    // name lives.
    {
      const length = 18;
      const nameTable = new Uint8Array(wordAlign(length));
      const nameView = viewOf(nameTable);
      nameView.setUint16(0, 0); // format
      nameView.setUint16(2, 0); // count
      nameView.setUint16(4, 6); // string storage offset
      tables.set(TtfTable.name, nameTable);
      tablesLength.set(TtfTable.name, length);
    }

    return this.writeFile(tables, tablesLength);
  }

  /** The sfnt header, the table directory, and the tables themselves. */
  private writeFile(
    tables: ReadonlyMap<string, Uint8Array>,
    tablesLength: ReadonlyMap<string, number>
  ): Uint8Array {
    const tableKeys = [
      TtfTable.head,
      TtfTable.hhea,
      TtfTable.maxp,
      TtfTable.os2,
      TtfTable.hmtx,
      TtfTable.cmap,
      TtfTable.loca,
      TtfTable.glyf,
      TtfTable.name,
      TtfTable.post
    ].filter(name => tables.has(name));

    const numTables = tableKeys.length;
    const directoryLength = 12 + numTables * 16;

    let total = directoryLength;
    for (const name of tableKeys) {
      total += (tables.get(name) as Uint8Array).length;
    }

    const output = new Uint8Array(total);
    const view = viewOf(output);

    view.setUint32(0, 0x00010000);
    view.setUint16(4, numTables);

    // searchRange / entrySelector / rangeShift are binary-search hints. These
    // are upstream's values, which do not match the specified formulas — the
    // range covers the padded table count and the selector is a natural
    // logarithm rather than a base-2 one. No reader depends on them, and
    // matching upstream keeps the two implementations byte-comparable.
    let pot = numTables;
    while ((pot & (pot - 1)) !== 0) {
      pot++;
    }
    view.setUint16(6, pot * 16);
    view.setUint16(8, Math.trunc(Math.log(pot)));
    view.setUint16(10, pot * 16 - numTables * 16);

    let offset = directoryLength;
    let headOffset = 0;
    let count = 0;

    for (const name of tableKeys) {
      const data = tables.get(name) as Uint8Array;
      const entry = 12 + count * 16;

      for (let i = 0; i < 4; i++) {
        output[entry + i] = name.charCodeAt(i);
      }
      view.setUint32(entry + 4, calcTableChecksum(data));
      view.setUint32(entry + 8, offset);
      view.setUint32(entry + 12, tablesLength.get(name) ?? data.length);

      if (name === TtfTable.head) {
        headOffset = offset;
      }

      output.set(data, offset);
      offset += data.length;
      count++;
    }

    // checkSumAdjustment is the whole-file checksum subtracted from a constant,
    // so it can only be written once the file is complete.
    view.setUint32(headOffset + 8, (0xb1b0afba - calcTableChecksum(output)) >>> 0);

    return output;
  }
}
