/*
 * js_pdf tests — phase 7.2 font fixes: cmap selection, glyph bounds, subset
 * tables, the ToUnicode CMap and WinAnsi coverage of the standard fonts.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Tests may use Node APIs; src/ may not (enforced by tools/check-source.mjs).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as Pdf from '../src/index.ts';
import { TtfParser } from '../src/pdf/font/ttf_parser.ts';
import { TtfWriter } from '../src/pdf/font/ttf_writer.ts';
import { PdfTtfFont } from '../src/pdf/obj/ttf_font.ts';
import { latin1 } from './support/pdf-text.mjs';
import { cmapFormat0, cmapFormat4, cmapFormat12, cmapTable, sfntTables, withTable } from './support/sfnt.mjs';

const asset = name => new Uint8Array(
  readFileSync(new URL(`../examples/assets/${name}`, import.meta.url))
);

const openSans = asset('OpenSans-Regular.ttf');
const roboto = asset('Roboto-Regular.ttf');
const icons = asset('MaterialIcons.ttf');

const withCmap = subtables => withTable(openSans, 'cmap', cmapTable(subtables));
const parse = subtables => new TtfParser(withCmap(subtables));
const unicode4 = segments => ({ platform: 3, encoding: 1, data: cmapFormat4(segments) });
const single = (code, glyph) => ({ start: code, end: code, delta: glyph - code });

/** Every `<cid> <utf-16be>` pair of every bfchar section, decoded. */
function toUnicode(source) {
  const program = source.slice(source.indexOf('beginbfchar'), source.indexOf('endcmap'));
  const map = new Map();
  for (const [, cid, destination] of program.matchAll(/<([0-9A-F]{4})> <([0-9A-F]+)>/g)) {
    const units = destination.match(/.{4}/g).map(unit => parseInt(unit, 16));
    map.set(parseInt(cid, 16), String.fromCharCode(...units));
  }
  return map;
}

const pdfText = (build, options = {}) => latin1(Pdf.createPdf({ compress: false, ...options }, () => new Pdf.Page({ build })));

// ---------------------------------------------------------------------------
// cmap subtables.
// ---------------------------------------------------------------------------

test('L120: format 0 reads its glyph array after the six-byte header', () => {
  const font = parse([{ platform: 1, encoding: 0, data: cmapFormat0({ 0x41: 36, 0x42: 37 }) }]);
  assert.equal(font.charToGlyphIndexMap.get(0x41), 36);
  assert.equal(font.charToGlyphIndexMap.get(0x42), 37);
  assert.equal(font.charToGlyphIndexMap.get(0x43), undefined, 'no code is shifted onto a neighbour');
});

test('L121: a Mac Roman subtable is never read as Unicode beside a Unicode one', () => {
  // 0xA8 and 0xAC too, so the check holds whichever offset format 0 is read at.
  const font = parse([
    { platform: 1, encoding: 0, data: cmapFormat0({ 0x41: 50, 0xa8: 99, 0xaa: 99, 0xac: 99 }) },
    unicode4([single(0x41, 36)])
  ]);
  assert.equal(font.charToGlyphIndexMap.get(0x41), 36);
  assert.equal(font.charToGlyphIndexMap.get(0xaa), undefined, 'Mac byte 0xAA is the trademark, not U+00AA');
});

test('L121: a Mac Roman-only font keeps its ASCII half, and only that', () => {
  const font = parse([{ platform: 1, encoding: 0, data: cmapFormat0({ 0x41: 36, 0xaa: 99 }) }]);
  assert.equal(font.charToGlyphIndexMap.get(0x41), 36);
  assert.equal(font.charToGlyphIndexMap.has(0xaa), false);
});

test('L121: Unicode subtables are ranked (3,10) > (0,4) > (3,1) > (0,3), not taken in record order', () => {
  const ranked = parse([
    { platform: 3, encoding: 10, data: cmapFormat12([[0x41, 0x41, 36]]) },
    { platform: 0, encoding: 4, data: cmapFormat12([[0x41, 0x42, 40]]) },
    unicode4([single(0x41, 38), single(0x43, 38)]),
    { platform: 0, encoding: 3, data: cmapFormat4([single(0x41, 39), single(0x43, 39), single(0x44, 39)]) }
  ]);
  assert.equal(ranked.charToGlyphIndexMap.get(0x41), 36, '(3,10) wins');
  assert.equal(ranked.charToGlyphIndexMap.get(0x42), 41, '(0,4) fills what (3,10) lacks');
  assert.equal(ranked.charToGlyphIndexMap.get(0x43), 38, '(3,1) beats (0,3)');
  assert.equal(ranked.charToGlyphIndexMap.get(0x44), 39, 'the weakest Unicode subtable still adds coverage');
});

test('L122: a symbol font is reachable by the low byte of its 0xF0xx codes', () => {
  const font = parse([{ platform: 3, encoding: 0, data: cmapFormat4([single(0x42, 40), single(0xf041, 36), single(0xf042, 37)]) }]);
  assert.equal(font.charToGlyphIndexMap.get(0xf041), 36);
  assert.equal(font.charToGlyphIndexMap.get(0x41), 36, 'drawString("A") finds U+F041');
  assert.equal(font.charToGlyphIndexMap.get(0x42), 40, 'an alias never displaces a real entry');

  const ttf = new PdfTtfFont(withCmap([{ platform: 3, encoding: 0, data: cmapFormat4([single(0xf041, 36)]) }]));
  assert.equal(ttf.isRuneSupported(0x41), true);
});

test('L123: format 4 applies idDelta to glyph id array lookups', () => {
  const font = parse([unicode4([{ start: 0x41, end: 0x42, delta: 2, glyphs: [34, 35] }])]);
  assert.equal(font.charToGlyphIndexMap.get(0x41), 36);
  assert.equal(font.charToGlyphIndexMap.get(0x42), 37);
});

test('L124: glyph 0 is not coverage in formats 4 and 12', () => {
  const font = parse([unicode4([
    { start: 0x43, end: 0x44, delta: 0, glyphs: [38, 0] },
    { start: 0x45, end: 0x45, delta: -0x45 }
  ])]);
  assert.equal(font.charToGlyphIndexMap.get(0x43), 38);
  assert.equal(font.charToGlyphIndexMap.has(0x44), false, 'a glyph id array hole');
  assert.equal(font.charToGlyphIndexMap.has(0x45), false, 'a delta that lands on 0');

  const wide = parse([{ platform: 3, encoding: 10, data: cmapFormat12([[0x40, 0x41, 0]]) }]);
  assert.equal(wide.charToGlyphIndexMap.has(0x40), false);
  assert.equal(wide.charToGlyphIndexMap.get(0x41), 1);
});

test('L124: a rune in a glyph-0 hole reaches the fallback font', () => {
  const holed = withCmap([unicode4([
    single(0x20, 3), single(0x43, 38), { start: 0x44, end: 0x44, delta: 0, glyphs: [0] }
  ])]);
  assert.equal(new PdfTtfFont(holed).isRuneSupported(0x44), false);

  const source = pdfText(() => new Pdf.Text('CD', { style: new Pdf.TextStyle({
    font: Pdf.Font.ttf(holed), fontFallback: [Pdf.Font.ttf(roboto)]
  }) }));
  assert.match(source, /\/BaseFont \/Roboto-Regular/);
});

test('L125: a malformed or truncated subtable is skipped, not thrown', () => {
  const file = withCmap([
    unicode4([single(0x41, 36)]),
    { platform: 3, encoding: 10, data: cmapFormat12([[0x41, 0x41, 37]]) }
  ]);
  const cmap = new TtfParser(file).tableOffsets.get('cmap');

  // Point the (3,10) record at `tail`, appended after the last table so that
  // it is cut short by the end of the file, or past the end when there is none.
  const glyphForA = tail => {
    const bytes = new Uint8Array(file.length + (tail?.length ?? 0));
    bytes.set(file);
    if (tail) bytes.set(tail, file.length);
    new DataView(bytes.buffer).setUint32(cmap + 4 + 8 + 4, tail ? file.length - cmap : 0xfffffff0);
    return new TtfParser(bytes).charToGlyphIndexMap.get(0x41);
  };

  assert.equal(glyphForA(null), 36, 'a record past the end of the file');
  assert.equal(glyphForA(cmapFormat0({ 0x41: 37 }).slice(0, 100)), 36, 'a format 0 cut short');
  assert.equal(glyphForA(cmapFormat4([single(0x41, 37)]).slice(0, 10)), 36, 'a format 4 cut short');
  const groups = cmapFormat12([[0x41, 0x41, 37]]);
  new DataView(groups.buffer).setUint32(12, 2);
  assert.equal(glyphForA(groups), 36, 'a format 12 claiming more groups than it holds');
});

// ---------------------------------------------------------------------------
// Glyph bounds.
// ---------------------------------------------------------------------------

test('L127: a glyph never reads past the size loca declares for it', () => {
  const parser = new TtfParser(openSans);
  const glyph = parser.charToGlyphIndexMap.get(0x41);
  const short = parser.indexToLocFormat === 0;
  const tables = sfntTables(openSans);

  const relocated = delta => {
    const loca = tables.get('loca').slice();
    const view = new DataView(loca.buffer);
    if (short) view.setUint16((glyph + 1) * 2, view.getUint16(glyph * 2) + delta / 2);
    else view.setUint32((glyph + 1) * 4, view.getUint32(glyph * 4) + delta);
    return new TtfParser(withTable(openSans, 'loca', loca));
  };

  const shrunk = relocated(12);
  assert.equal(shrunk.glyphSizes[glyph], 12);
  assert.equal(shrunk.readGlyph(glyph).data.length, 12, 'clamped to the declared 12 bytes');

  const inverted = relocated(-4);
  assert.equal(inverted.readGlyph(glyph).data.length, 0, 'a negative size is an empty glyph');
});

// ---------------------------------------------------------------------------
// Subset tables.
// ---------------------------------------------------------------------------

const subsetOf = (bytes, text) => {
  const parser = new TtfParser(bytes);
  return { parser, subset: new TtfWriter(parser).withChars([0, ...[...text].map(c => c.codePointAt(0))]) };
};

test('L130: a subset keeps the hinting programs its glyph instructions call', () => {
  const { parser, subset } = subsetOf(openSans, 'Hinted');
  const source = sfntTables(openSans);
  const copied = sfntTables(subset);
  for (const tag of ['cvt ', 'fpgm', 'prep', 'gasp']) {
    assert.ok(parser.tableOffsets.has(tag), `the fixture has \`${tag}\``);
    assert.deepEqual(copied.get(tag), source.get(tag), `\`${tag}\` is copied verbatim`);
  }

  // A font without some of them still subsets, carrying only what it has.
  const cjk = sfntTables(subsetOf(asset('JsPdfCjkExample.ttf'), '中文').subset);
  assert.ok(cjk.has('prep') && cjk.has('gasp'));
  assert.ok(!cjk.has('cvt ') && !cjk.has('fpgm'));
});

test('L131: the subset header carries the spec search fields and sorted records', () => {
  for (const bytes of [openSans, asset('JsPdfCjkExample.ttf')]) {
    const { subset } = subsetOf(bytes, 'abc');
    const view = new DataView(subset.buffer, subset.byteOffset, subset.byteLength);
    const count = view.getUint16(4);
    let selector = 0;
    while (2 ** (selector + 1) <= count) selector++;
    assert.equal(view.getUint16(6), 16 * 2 ** selector, 'searchRange');
    assert.equal(view.getUint16(8), selector, 'entrySelector');
    assert.equal(view.getUint16(10), count * 16 - 16 * 2 ** selector, 'rangeShift');

    const tags = [...sfntTables(subset).keys()];
    assert.deepEqual(tags, [...tags].sort(), 'records in ascending tag order');
    assert.doesNotThrow(() => new TtfParser(subset));
  }
});

// ---------------------------------------------------------------------------
// ToUnicode.
// ---------------------------------------------------------------------------

test('L134: ToUnicode destinations above U+FFFF are UTF-16BE surrogate pairs', () => {
  const rune = 0x10fffd;
  assert.ok(new TtfParser(icons).charToGlyphIndexMap.get(rune) > 0, 'the fixture draws U+10FFFD');
  const source = pdfText(() => new Pdf.Text(`A${String.fromCodePoint(rune)}`, {
    style: new Pdf.TextStyle({ font: Pdf.Font.ttf(icons) })
  }));
  assert.match(source, /<0002> <DBFFDFFD>/);
  assert.doesNotMatch(source, /<[0-9A-F]{4}> <[0-9A-F]{5,7}>\n/, 'no 5-7 digit destinations');
  assert.equal(toUnicode(source).get(2), String.fromCodePoint(rune));
});

const manyRunes = [
  ...Array.from({ length: 94 }, (_, i) => 0x21 + i),
  ...Array.from({ length: 60 }, (_, i) => 0xc0 + i),
  ...Array.from({ length: 40 }, (_, i) => 0x410 + i)
].map(code => String.fromCodePoint(code)).join('');
const manyLines = manyRunes.match(/.{1,40}/gu).join('\n');

test('L135: ToUnicode is written in bfchar sections of at most 100 entries', () => {
  const source = pdfText(() => new Pdf.Text(manyLines, {
    style: new Pdf.TextStyle({ font: Pdf.Font.ttf(openSans), fontSize: 6 })
  }));
  const program = source.slice(source.indexOf('beginbfchar') - 8, source.indexOf('endcmap'));
  const sections = [...program.matchAll(/(\d+) beginbfchar\n([^]*?)endbfchar/g)];
  assert.deepEqual(sections.map(([, count]) => Number(count)), [100, 95]);
  for (const [, count, body] of sections) {
    assert.equal(body.trim().split('\n').length, Number(count), 'each header counts its own entries');
  }

  const map = toUnicode(source);
  assert.equal(map.size, 195);
  assert.equal([...map.values()].slice(1).join(''), manyRunes);
});

test('L135: protect still blanks every section of the ToUnicode CMap', () => {
  const source = pdfText(() => new Pdf.Text(manyLines, {
    style: new Pdf.TextStyle({ font: Pdf.Font.ttf(openSans, { protect: true }), fontSize: 6 })
  }));
  const map = toUnicode(source);
  assert.equal(map.size, 195);
  assert.equal(map.get(0), '\0');
  for (const [cid, text] of map) if (cid > 0) assert.equal(text, ' ');
});

// ---------------------------------------------------------------------------
// The standard 14 fonts.
// ---------------------------------------------------------------------------

test('L138: a Type1 font supports the WinAnsi repertoire, not Latin-1', () => {
  const helvetica = Pdf.PdfType1Font.helvetica();
  for (const rune of [0x41, 0xe9, 0xff, 0x2013, 0x2014, 0x2018, 0x201d, 0x20ac, 0x2022, 0x2026, 0x2122, 0x0152]) {
    assert.equal(helvetica.isRuneSupported(rune), true, `U+${rune.toString(16)}`);
  }
  for (const rune of [0x80, 0x81, 0x8d, 0x9f, 0x100, 0x3a9, 0x4e2d]) {
    assert.equal(helvetica.isRuneSupported(rune), false, `U+${rune.toString(16)}`);
  }
});

test('L138: WinAnsi punctuation stays in Helvetica, C1 controls go to the fallback', () => {
  const fallback = { fontFallback: [Pdf.Font.ttf(openSans)] };
  const typographic = pdfText(() => new Pdf.Text('a–b“c”€•…', { style: new Pdf.TextStyle(fallback) }));
  assert.doesNotMatch(typographic, /OpenSans/, 'nothing reaches the fallback font');
  assert.match(typographic, /\(a\\226b\\223c\\224\\200\\225\\205\) Tj/);

  const control = pdfText(() => new Pdf.Text('a\u0080b'));
  assert.doesNotMatch(control, /\\200/, 'U+0080 is not drawn as the euro');
  assert.match(control, /\(a\?b\) Tj/);
});
