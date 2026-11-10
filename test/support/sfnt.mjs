/*
 * js_pdf test support — synthetic sfnt and cmap builders.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * The bundled fonts all carry the same two Unicode cmap subtables and no
 * glyph-0 holes, so the cmap and loca edge cases have to be built by hand. These
 * helpers take a real font apart into its tables, let a test replace one, and
 * reassemble a file the parser reads like any other.
 */

/** Big-endian writer for the small tables a test assembles. */
class Writer {
  constructor() {
    this.bytes = [];
  }

  u8(value) {
    this.bytes.push(value & 0xff);
    return this;
  }

  u16(value) {
    return this.u8(value >> 8).u8(value);
  }

  u32(value) {
    return this.u16(value >>> 16).u16(value & 0xffff);
  }

  get result() {
    return Uint8Array.from(this.bytes);
  }
}

/** The tables of an sfnt file, keyed by tag, each copied out of the file. */
export function sfntTables(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = new Map();
  for (let i = 0; i < view.getUint16(4); i++) {
    const record = 12 + i * 16;
    const tag = String.fromCharCode(...bytes.subarray(record, record + 4));
    const offset = view.getUint32(record + 8);
    tables.set(tag, bytes.slice(offset, offset + view.getUint32(record + 12)));
  }
  return tables;
}

/** Reassemble tables into an sfnt file, records in tag order. */
export function sfntFile(tables) {
  const tags = [...tables.keys()].sort();
  let total = 12 + tags.length * 16;
  for (const tag of tags) total += (tables.get(tag).length + 3) & ~3;

  const output = new Uint8Array(total);
  const view = new DataView(output.buffer);
  view.setUint32(0, 0x00010000);
  view.setUint16(4, tags.length);

  let offset = 12 + tags.length * 16;
  tags.forEach((tag, i) => {
    const data = tables.get(tag);
    for (let j = 0; j < 4; j++) output[12 + i * 16 + j] = tag.charCodeAt(j);
    view.setUint32(12 + i * 16 + 8, offset);
    view.setUint32(12 + i * 16 + 12, data.length);
    output.set(data, offset);
    offset += (data.length + 3) & ~3;
  });
  return output;
}

/** A copy of `font` with one table replaced. */
export function withTable(font, tag, data) {
  const tables = sfntTables(font);
  tables.set(tag, data);
  return sfntFile(tables);
}

/**
 * A `cmap` table from `{ platform, encoding, data }` records, laid out in the
 * order given. `offset` overrides where a record points, for corrupt fixtures.
 */
export function cmapTable(subtables) {
  const writer = new Writer().u16(0).u16(subtables.length);
  let offset = 4 + subtables.length * 8;
  for (const subtable of subtables) {
    writer.u16(subtable.platform).u16(subtable.encoding).u32(subtable.offset ?? offset);
    offset += subtable.data.length;
  }
  for (const subtable of subtables) for (const byte of subtable.data) writer.u8(byte);
  return writer.result;
}

/** Format 0: a byte-indexed array of 256 glyph ids. */
export function cmapFormat0(map) {
  const writer = new Writer().u16(0).u16(262).u16(0);
  for (let code = 0; code < 256; code++) writer.u8(map[code] ?? 0);
  return writer.result;
}

/**
 * Format 4 from `{ start, end, delta, glyphs? }` segments. A segment with
 * `glyphs` is looked up through the glyph id array, the others by delta alone.
 * The mandatory 0xFFFF terminator is appended.
 */
export function cmapFormat4(segments) {
  const all = [...segments, { start: 0xffff, end: 0xffff, delta: 1 }];
  const count = all.length;
  const glyphIds = [];
  const rangeOffsets = all.map((segment, i) => {
    if (!segment.glyphs) return 0;
    const position = glyphIds.length;
    glyphIds.push(...segment.glyphs);
    return (count - i) * 2 + position * 2;
  });

  const writer = new Writer().u16(4).u16(16 + count * 8 + glyphIds.length * 2).u16(0)
    .u16(count * 2).u16(0).u16(0).u16(0);
  for (const segment of all) writer.u16(segment.end);
  writer.u16(0);
  for (const segment of all) writer.u16(segment.start);
  for (const segment of all) writer.u16(segment.delta & 0xffff);
  for (const offset of rangeOffsets) writer.u16(offset);
  for (const glyph of glyphIds) writer.u16(glyph);
  return writer.result;
}

/** Format 12 from `[startCode, endCode, startGlyph]` groups. */
export function cmapFormat12(groups) {
  const writer = new Writer().u16(12).u16(0).u32(16 + groups.length * 12).u32(0).u32(groups.length);
  for (const [start, end, glyph] of groups) writer.u32(start).u32(end).u32(glyph);
  return writer.result;
}
