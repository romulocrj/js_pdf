/*
 * js_pdf phase 6.9 directional layout example tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as source from '../src/index.ts';
import { generateDirectionalLayoutPhase69 } from '../examples/directional-layout-phase-6.9.mjs';
import { latin1 } from './support/pdf-text.mjs';

test('directional layout example produces the same PDF from source and bundled APIs', () => {
  const normalize = bytes => Buffer.from(bytes).toString('latin1').replace(/\/CreationDate \(D:\d{14}Z\)/, '/CreationDate (D:20261110000000Z)');
  const bytes = generateDirectionalLayoutPhase69();
  assert.equal(normalize(bytes), normalize(generateDirectionalLayoutPhase69(source)));
  const pdf = latin1(generateDirectionalLayoutPhase69(source, false));
  assert.equal((pdf.match(/\/Type \/Page\b/g) ?? []).length, 4);
  assert.match(pdf, /\/Title \(Directional layout - phase 6\.9\)/);
  assert.doesNotMatch(pdf, /NaN|Infinity/);
  const streams = [...pdf.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map(match => match[1]);
  // The linear gradients run from the start side of each 250pt column: the ltr
  // one from x = 32, the rtl one from its right edge, 32 + 250 + 15 + 250 = 547.
  assert.match(pdf, /\/Coords \[32 [\d.]+ 282 [\d.]+\]/);
  assert.match(pdf, /\/Coords \[547 [\d.]+ 297 [\d.]+\]/);
  // The radial gradient's centre is topStart: the top-left, then the top-right.
  assert.match(pdf, /\/Coords \[32 [\d.]+ 0 32 [\d.]+ [\d.]+\]/);
  assert.match(pdf, /\/Coords \[547 [\d.]+ 0 547 [\d.]+ [\d.]+\]/);
  // The last page is rtl with a 96pt start margin, now on the right: the header
  // strip ends at 595.28 - 96 = 499.28, and the 200pt block starts at the left.
  const last = streams.find(stream => stream.includes('rtl page: the header sits on the start'));
  const rects = [...last.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re/g)].map(match => match.slice(1).map(Number));
  assert.ok(rects.some(([x, , width]) => x > 200 && Math.abs(x + width - 499.28) < 0.01), 'header against the start margin');
  assert.ok(rects.some(([x, , width]) => x === 32 && width === 200), 'crossAxisAlignment end is the left side');
});
