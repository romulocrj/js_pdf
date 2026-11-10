/*
 * js_pdf phase 6.11 PDF/A example tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as source from '../src/index.ts';
import { generatePdfaPhase611 } from '../examples/pdfa-phase-6.11.mjs';
import { latin1 } from './support/pdf-text.mjs';

const asset = name => new Uint8Array(readFileSync(new URL('../examples/assets/' + name, import.meta.url)));
const assets = { regular: asset('OpenSans-Regular.ttf'), bold: asset('OpenSans-Bold.ttf'), colorProfile: asset('JsPdfSrgbExample.icc') };

test('PDF/A example produces the same PDF from source and bundled APIs', () => {
  // The example fixes its creation date, so the bytes, /ID included, are stable.
  assert.deepEqual(generatePdfaPhase611(undefined, true, assets), generatePdfaPhase611(source, true, assets));
  assert.throws(() => generatePdfaPhase611(source, true, {}), /OpenSans-Regular\.ttf/);
});

test('PDF/A example is a two-page PDF/A-3B file with an embedded invoice', () => {
  const pdf = latin1(generatePdfaPhase611(source, false, assets));
  assert.equal((pdf.match(/\/Type \/Page\b/g) ?? []).length, 2);
  assert.match(pdf, /\/OutputIntents \[<< \/Type \/OutputIntent \/S \/GTS_PDFA1 \/OutputConditionIdentifier \(js_pdf sRGB-like example profile\)/);
  assert.match(pdf, /<pdfaid:part>3<\/pdfaid:part>/);
  assert.match(pdf, /<pdfaid:conformance>B<\/pdfaid:conformance>/);
  assert.match(pdf, /<fx:ConformanceLevel>MINIMUM<\/fx:ConformanceLevel>/);
  assert.match(pdf, /\/AF \[\d+ 0 R\]/);
  assert.match(pdf, /\/EmbeddedFiles \d+ 0 R/);
  assert.match(pdf, /\/AFRelationship \/Alternative \/Desc \(Factur-X invoice data\)/);
  assert.match(pdf, /\/Type \/EmbeddedFile \/Subtype \/text#2fxml \/Params << \/Size \d+ \/ModDate \(D:20261110090000Z\) >>/);
  assert.match(pdf, /trailer\n<< \/Size \d+ \/Root 1 0 R \/Info \d+ 0 R \/ID \[<[0-9a-f]{32}> <[0-9a-f]{32}>\] >>/);
  assert.doesNotMatch(pdf, /\/Subtype \/Type1/, 'no standard font reaches the file');
  assert.doesNotMatch(pdf, /\/DeviceCMYK| k\n| K\n/);
  assert.doesNotMatch(pdf, /NaN|Infinity/);
});
