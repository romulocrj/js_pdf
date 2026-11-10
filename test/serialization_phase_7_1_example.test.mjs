/*
 * js_pdf phase 7.1 serialization example integration tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as source from '../src/index.ts';
import { generateSerializationPhase71 } from '../examples/serialization-phase-7.1.mjs';

test('serialization example produces the same PDF from source and bundled APIs', () => {
  const normalize = bytes => Buffer.from(bytes).toString('latin1').replace(/\/CreationDate \(D:\d{14}Z\)/, '/CreationDate (D:20261110000000Z)');
  const bytes = generateSerializationPhase71();
  assert.equal(normalize(bytes), normalize(generateSerializationPhase71(source)));
  const pdf = normalize(generateSerializationPhase71(source, false));

  // Metadata in UTF-16BE, page labels with their page-0 entry.
  assert.match(pdf, /\/Title <feff0053[0-9a-f]*20ac[0-9a-f]*> \/Author \(Romulo Campos\)/);
  assert.match(pdf, /\/Nums \[0 << \/S \/D >> 2 << \/S \/r \/P \(Annex \) >>\]/);
  assert.doesNotMatch(pdf, /NaN|Infinity|\d[eE][+-]\d/);

  // One parent field for the header field repeated on every page.
  const pages = Number(pdf.match(/\/Type \/Pages \/Count (\d+)/)[1]);
  assert.ok(pages >= 3);
  const parent = pdf.match(/<< \/T \(reviewer\) \/Kids \[([^\]]*)\] \/FT \/Tx/);
  assert.ok(parent, 'reviewer is one parent field');
  assert.equal(parent[1].split(' 0 R').filter(entry => entry.trim()).length, pages);

  // Named destinations sorted by bytes and unique; the user anchor stays apart.
  const keys = [...pdf.match(/\/Dests << \/Names \[([^]*?)\] \/Limits/)[1].matchAll(/\(([^()]*)\) << \/D/g)]
    .map(match => match[1]);
  assert.deepEqual(keys, [...new Set(keys)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  assert.ok(keys.includes('outline-1') && keys.includes('bookmark-only') && keys.includes('__dest0'));

  // Every TOC row prints the page its bookmark really points at.
  const kids = pdf.match(/\/Type \/Pages \/Count \d+ \/Kids \[([^\]]*)\]/)[1]
    .split(' 0 R').map(entry => entry.trim()).filter(Boolean);
  const destinationPage = new Map([...pdf.matchAll(/\(([^()]+)\) << \/D \[(\d+) 0 R/g)]
    .map(match => [match[1], kids.indexOf(match[2]) + 1]));
  const rows = [...pdf.matchAll(/\/A << \/S \/GoTo \/D \(([^()]+)\) >>/g)].map(match => match[1]);
  assert.ok(rows.length >= 17);
  const printed = [...pdf.matchAll(/\(((?:[^()\\]|\\.)+)\) Tj[^()]*?\((\d+)\) Tj/g)]
    .filter(match => /^\d\.|Outline/.test(match[1]))
    .map(match => Number(match[2]));
  assert.equal(printed.length, 17);
  assert.deepEqual(printed, rows.slice(0, 17).map(name => destinationPage.get(name)));
});
