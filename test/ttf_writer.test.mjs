/*
 * js_pdf tests — the phase 1.2 TTF subsetting writer.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Tests may use Node APIs; src/ may not (enforced by tools/check-source.mjs).
 *
 * The acceptance test for a subset is that the phase 1.1 parser reads it back:
 * a reader that cannot parse the font cannot draw with it either.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import { TtfParser } from '../src/pdf/font/ttf_parser.ts';
import { TtfWriter } from '../src/pdf/font/ttf_writer.ts';

const asset = name => new Uint8Array(
  readFileSync(new URL(`../examples/assets/${name}`, import.meta.url))
);

const fontFiles = readdirSync(new URL('../examples/assets/', import.meta.url))
  .filter(name => name.endsWith('.ttf'))
  .sort();

/** CID 0 is `.notdef`; the rest are the distinct code points, in order. */
const cidsFor = text => [0, ...new Set([...text].map(character => character.codePointAt(0)))];

const SAMPLE = 'Hello World! Relatório de execução — ÀÉÎÕÜ';

test('a subset re-parses and keeps one glyph per requested code point', () => {
  const source = new TtfParser(asset('OpenSans-Regular.ttf'));
  const cids = cidsFor(SAMPLE);
  const subset = new TtfWriter(source).withChars(cids);
  const reparsed = new TtfParser(subset);

  assert.ok(subset.length < source.bytes.length / 10, 'a subset must be far smaller than the font');
  assert.ok(reparsed.numGlyphs >= cids.length, 'every CID needs a glyph');
  assert.equal(reparsed.unitsPerEm, source.unitsPerEm);
  assert.equal(reparsed.indexToLocFormat, source.indexToLocFormat);

  for (let cid = 0; cid < cids.length; cid++) {
    assert.doesNotThrow(() => reparsed.readGlyph(cid), `CID ${cid} must be readable`);
  }
});

test('CID order survives: glyph i of the subset is the glyph for chars[i]', () => {
  const source = new TtfParser(asset('Roboto-Regular.ttf'));
  const cids = cidsFor(SAMPLE);
  const reparsed = new TtfParser(new TtfWriter(source).withChars(cids));

  for (let cid = 1; cid < cids.length; cid++) {
    const original = source.glyphInfoMap.get(source.charToGlyphIndexMap.get(cids[cid]));
    const embedded = reparsed.glyphInfoMap.get(cid);

    assert.ok(original, `Roboto must have a glyph for U+${cids[cid].toString(16)}`);
    assert.ok(embedded, `the subset must have a glyph at CID ${cid}`);
    assert.equal(
      embedded.advanceWidth.toFixed(6),
      original.advanceWidth.toFixed(6),
      `CID ${cid} must keep its advance width`
    );
  }
});

test('a code point the font cannot draw still occupies its own CID', () => {
  // MaterialIcons has no space glyph and no Latin letters, which is exactly the
  // case where upstream drops entries and shifts every later CID.
  const source = new TtfParser(asset('MaterialIcons.ttf'));
  assert.equal(source.charToGlyphIndexMap.has(32), false, 'the fixture must lack a space glyph');

  const cids = cidsFor('a b');
  const reparsed = new TtfParser(new TtfWriter(source).withChars(cids));

  assert.ok(reparsed.numGlyphs >= cids.length);
  for (let cid = 0; cid < cids.length; cid++) {
    assert.doesNotThrow(() => reparsed.readGlyph(cid));
  }
});

test('composite glyphs pull in their components and point at them', () => {
  const source = new TtfParser(asset('OpenSans-Regular.ttf'));

  // Find an accented letter that really is built from components.
  const composite = [...'ÀÉÎÕÜçã'].map(character => character.codePointAt(0)).find(rune => {
    const glyph = source.charToGlyphIndexMap.get(rune);
    return glyph !== undefined && source.readGlyph(glyph).compounds.length > 0;
  });
  assert.ok(composite !== undefined, 'the fixture must contain a composite glyph');

  const cids = [0, composite];
  const subset = new TtfWriter(source).withChars(cids);
  const reparsed = new TtfParser(subset);

  const glyph = reparsed.readGlyph(1);
  assert.ok(glyph.compounds.length > 0, 'the composite must stay composite');
  for (const component of glyph.compounds) {
    assert.ok(
      component < reparsed.numGlyphs,
      `component ${component} must be inside the subset's ${reparsed.numGlyphs} glyphs`
    );
    assert.doesNotThrow(() => reparsed.readGlyph(component));
  }
});

test('every font the examples load can be subset and re-parsed', () => {
  assert.ok(fontFiles.length >= 10, 'the fixture set must not have shrunk');

  for (const name of fontFiles) {
    const source = new TtfParser(asset(name));
    const cids = cidsFor(SAMPLE);
    const subset = new TtfWriter(source).withChars(cids);
    const reparsed = new TtfParser(subset);

    assert.ok(subset.length < source.bytes.length, `${name} must shrink`);
    assert.ok(reparsed.numGlyphs >= cids.length, `${name} must keep every CID`);

    for (let cid = 0; cid < reparsed.numGlyphs; cid++) {
      assert.doesNotThrow(() => reparsed.readGlyph(cid), `${name} CID ${cid}`);
    }
  }
});

test('the subset declares the tables a PDF reader needs', () => {
  const source = new TtfParser(asset('OpenSans-Regular.ttf'));
  const reparsed = new TtfParser(new TtfWriter(source).withChars(cidsFor('abc')));

  for (const table of ['head', 'hhea', 'maxp', 'hmtx', 'cmap', 'loca', 'glyf', 'name', 'post']) {
    assert.ok(reparsed.tableOffsets.has(table), `the subset must carry \`${table}\``);
  }

  // Every table has to land inside the file it claims to be part of.
  for (const [name, offset] of reparsed.tableOffsets) {
    assert.ok(
      offset + reparsed.tableSize.get(name) <= reparsed.bytes.length,
      `\`${name}\` runs past the end of the subset`
    );
  }
});

test('checkSumAdjustment makes the whole-file checksum come out right', () => {
  const source = new TtfParser(asset('Roboto-Regular.ttf'));
  const subset = new TtfWriter(source).withChars(cidsFor('abc'));

  const view = new DataView(subset.buffer, subset.byteOffset, subset.byteLength);
  let sum = 0;
  for (let i = 0; i < subset.byteLength - 3; i += 4) {
    sum = (sum + view.getUint32(i)) >>> 0;
  }

  assert.equal(sum, 0xb1b0afba);
});
