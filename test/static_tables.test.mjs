/*
 * js_pdf static table characterization tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

// Phase 7.0 packs three large literal tables (the Material palette, the PDF417
// codeword clusters and the standard Type1 advance widths) into compact strings
// to reduce the minified bundle. These fingerprints were taken from the
// original literal tables before packing, so any decoding error, reordering or
// lost freeze shows up here as a mismatch.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as pw from '../src/index.ts';
import * as type1 from '../src/pdf/font/type1_fonts.ts';
import { codewords } from '../src/barcode/pdf417_codewords.ts';

const sha256 = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function paletteFingerprint(PdfColors) {
  const names = Object.getOwnPropertyNames(PdfColors)
    .filter(name => !['length', 'name', 'prototype', 'getColor'].includes(name));
  const firstName = value => names.find(name => PdfColors[name] === value);
  return names.map(name => {
    const value = PdfColors[name];
    if (Array.isArray(value)) return [name, Object.isFrozen(value), value.map(firstName)];
    return [name, Object.isFrozen(value), value.toInt(), value.alpha, firstName(value)];
  });
}

const widthTables = () => Object.entries(type1)
  .filter(([, value]) => Array.isArray(value))
  .map(([name, value]) => [name, Object.isFrozen(value), [...value]]);

test('the packed Material palette decodes to the original constants', () => {
  const fingerprint = paletteFingerprint(pw.PdfColors);
  assert.equal(fingerprint.length, 256 + 35 + 2);
  assert.deepEqual(fingerprint[0], ['red50', true, 0xffffebee, 1, 'red50']);
  assert.deepEqual(fingerprint.find(([name]) => name === 'blueGrey'),
    ['blueGrey', true, 0xff607d8b, 1, 'blueGrey500']);
  assert.equal(sha256(fingerprint), '5753f1951992488c1c1e3070a9a71b6573501112558a423adb699aa42874c50d');
});

test('the packed PDF417 clusters decode to the original codewords', () => {
  assert.equal(codewords.length, 3);
  assert.deepEqual(codewords.map(cluster => cluster.length), [929, 929, 929]);
  assert.equal(codewords[0][0], 0x1d5c0);
  assert.equal(codewords[2][928], 0x1c7ea);
  assert.equal(sha256(codewords.map(cluster => [...cluster])), 'd4612cb3b3f0dddd1b917d6d02429a7ea24ea73f73bd3897ef9c537c51cd32ef');
});

test('the packed Type1 width tables decode to the original AFM widths', () => {
  const tables = widthTables();
  assert.equal(tables.length, 10);
  assert.equal(type1.helveticaWidths[65], 0.667);
  assert.equal(sha256(tables), 'be104f639f59109ead05cb284df2ddd9527e38853b9aa10711b31953306476d6');
});
