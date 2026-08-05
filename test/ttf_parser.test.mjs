/*
 * js_pdf tests — the phase 1.1 TTF parser.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Tests may use Node APIs; src/ may not (enforced by tools/check-source.mjs).
 *
 * The fixtures are the real fonts already in examples/assets/, which are the
 * ones the upstream examples load — so what passes here is what phase 1.3 will
 * have to embed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { TtfParser, TtfParserName } from '../src/pdf/font/ttf_parser.ts';

const asset = name => new Uint8Array(
  readFileSync(new URL(`../examples/assets/${name}`, import.meta.url))
);

const openSans = new TtfParser(asset('OpenSans-Regular.ttf'));
const roboto = new TtfParser(asset('Roboto-Regular.ttf'));

test('the table directory finds the required tables', () => {
  for (const table of ['head', 'name', 'hmtx', 'hhea', 'cmap', 'maxp', 'loca', 'glyf']) {
    assert.ok(openSans.tableOffsets.has(table), `OpenSans must expose \`${table}\``);
    assert.ok(openSans.tableSize.get(table) > 0, `\`${table}\` must have a size`);
  }

  // Every offset must land inside the file.
  for (const [name, offset] of openSans.tableOffsets) {
    assert.ok(
      offset + openSans.tableSize.get(name) <= openSans.bytes.length,
      `\`${name}\` runs past the end of the file`
    );
  }
});

test('head, hhea and maxp report the documented values', () => {
  assert.equal(openSans.unitsPerEm, 2048);
  assert.equal(roboto.unitsPerEm, 2048);

  assert.ok(openSans.unicode, 'sfnt version 1.0 marks a TrueType outline font');
  assert.equal(openSans.hasCff, false, 'OpenSans has glyf outlines, not CFF');

  assert.ok(openSans.ascent > 0);
  assert.ok(openSans.descent < 0);
  assert.ok(openSans.numGlyphs > 200);
  assert.ok(openSans.numOfLongHorMetrics > 0);
  assert.ok([0, 1].includes(openSans.indexToLocFormat));

  assert.ok(openSans.xMin < openSans.xMax);
  assert.ok(openSans.yMin < openSans.yMax);
});

test('the name table yields the PostScript name', () => {
  assert.equal(openSans.getNameID(TtfParserName.postScriptName), 'OpenSans-Regular');
  assert.equal(openSans.fontName, 'OpenSans-Regular');
  assert.equal(roboto.fontName, 'Roboto-Regular');
  assert.match(openSans.getNameID(TtfParserName.fontFamily), /Open Sans/);
  assert.equal(openSans.getNameID(9999), null, 'an absent name ID is null, not a throw');
});

test('cmap maps codepoints to glyphs, including outside Latin-1', () => {
  // Glyph 0 is .notdef, so a real mapping is never 0.
  for (const character of 'Aaçã0 ') {
    const glyph = openSans.charToGlyphIndexMap.get(character.codePointAt(0));
    assert.ok(glyph > 0, `\`${character}\` must map to a glyph`);
  }

  // Distinct characters get distinct glyphs.
  const a = openSans.charToGlyphIndexMap.get(0x41);
  const b = openSans.charToGlyphIndexMap.get(0x42);
  assert.notEqual(a, b);

  // Cyrillic: the whole point of TTF over the WinAnsi ceiling.
  assert.ok(openSans.charToGlyphIndexMap.get(0x0416) > 0, 'U+0416 must map');

  assert.equal(openSans.charToGlyphIndexMap.get(0x10FFFF), undefined);
});

test('hmtx advance widths are normalized to em units', () => {
  const space = openSans.glyphInfoMap.get(openSans.charToGlyphIndexMap.get(0x20));
  const capitalM = openSans.glyphInfoMap.get(openSans.charToGlyphIndexMap.get(0x4D));
  const lowercaseI = openSans.glyphInfoMap.get(openSans.charToGlyphIndexMap.get(0x69));

  for (const metrics of [space, capitalM, lowercaseI]) {
    assert.ok(metrics.advanceWidth > 0 && metrics.advanceWidth < 2, 'em units, not font units');
  }

  assert.ok(capitalM.advanceWidth > lowercaseI.advanceWidth, 'M is wider than i');
  assert.ok(capitalM.right > capitalM.left, 'a drawn glyph has a bounding box');

  // A blank glyph advances but has no box.
  assert.equal(space.right, 0);
  assert.equal(space.left, 0);
  assert.ok(space.advanceWidth > 0);

  assert.equal(openSans.glyphInfoMap.size, openSans.numGlyphs);
});

test('loca offsets are monotonic and stay inside glyf', () => {
  assert.equal(openSans.glyphOffsets.length, openSans.numGlyphs);
  assert.equal(openSans.glyphSizes.length, openSans.numGlyphs);

  const glyfSize = openSans.tableSize.get('glyf');
  let previous = -1;
  for (let i = 0; i < openSans.glyphOffsets.length; i++) {
    assert.ok(openSans.glyphOffsets[i] >= previous, `glyph ${i} offset went backwards`);
    assert.ok(openSans.glyphSizes[i] >= 0, `glyph ${i} has a negative size`);
    assert.ok(
      openSans.glyphOffsets[i] + openSans.glyphSizes[i] <= glyfSize,
      `glyph ${i} runs past the end of glyf`
    );
    previous = openSans.glyphOffsets[i];
  }
});

test('readGlyph slices a program whose length matches loca', () => {
  const glyph = openSans.charToGlyphIndexMap.get(0x41);
  const info = openSans.readGlyph(glyph);

  assert.equal(info.index, glyph);
  assert.ok(info.data.length > 0, 'A is a drawn glyph');
  assert.deepEqual(info.compounds, [], 'A is simple, not composite');

  // The walk must not overrun what loca declared for this glyph.
  assert.ok(info.data.length <= openSans.glyphSizes[glyph]);

  // A blank glyph reads back empty rather than throwing.
  const space = openSans.readGlyph(openSans.charToGlyphIndexMap.get(0x20));
  assert.equal(space.data.length, 0);

  assert.throws(() => openSans.readGlyph(openSans.numGlyphs), RangeError);
  assert.throws(() => openSans.readGlyph(-1), RangeError);
});

test('every glyph in both fonts reads without overrunning', () => {
  for (const font of [openSans, roboto]) {
    let composites = 0;

    for (let i = 0; i < font.numGlyphs; i++) {
      const info = font.readGlyph(i);
      assert.ok(info.data.length <= font.glyphSizes[i], `glyph ${i} overran its loca entry`);

      for (const component of info.compounds) {
        assert.ok(component < font.numGlyphs, `glyph ${i} refers to a glyph outside the font`);
      }

      if (info.compounds.length > 0) composites++;
    }

    // Accented Latin is built from composites, so these fonts must have some —
    // that is what phase 1.2 has to chase when it subsets.
    assert.ok(composites > 0, 'expected composite glyphs');
  }
});

test('a composite glyph reports the glyphs it is built from', () => {
  // á = a + acute in both fonts.
  const composite = openSans.readGlyph(openSans.charToGlyphIndexMap.get(0xE1));
  assert.ok(composite.compounds.length >= 2, 'a-acute is built from components');
  assert.ok(composite.compounds.includes(openSans.charToGlyphIndexMap.get(0x61)));
});

test('a non-font byte array is rejected at parse time', () => {
  assert.throws(() => new TtfParser(new Uint8Array(64)), TypeError);
});

test('every TTF the examples load parses end to end', () => {
  const names = [
    'LibreBaskerville-Bold.ttf', 'LibreBaskerville-Italic.ttf',
    'LibreBaskerville-Regular.ttf', 'MaterialIcons.ttf',
    'Metrophobic-Regular.ttf', 'OpenSans-Bold.ttf', 'OpenSans-Regular.ttf',
    'Roboto-Bold.ttf', 'Roboto-Italic.ttf', 'Roboto-Light.ttf',
    'Roboto-Regular.ttf'
  ];

  for (const name of names) {
    const font = new TtfParser(asset(name));

    assert.ok(font.unitsPerEm > 0, `${name}: unitsPerEm`);
    assert.ok(font.numGlyphs > 0, `${name}: numGlyphs`);
    assert.ok(font.fontName.length > 0, `${name}: fontName`);
    assert.ok(font.charToGlyphIndexMap.size > 0, `${name}: cmap`);
    assert.equal(font.glyphInfoMap.size, font.numGlyphs, `${name}: metrics per glyph`);

    // MaterialIcons is the phase 5.4 icon font: its glyphs live in the Private
    // Use Area, well past anything WinAnsi could address.
    if (name === 'MaterialIcons.ttf') {
      assert.ok(font.charToGlyphIndexMap.get(0xE84D) > 0, 'PUA codepoints must map');
    }
  }
});
