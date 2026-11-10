/*
 * js_pdf phase 7.4 SVG example integration tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as source from '../src/index.ts';
import { generateSvgPhase74 } from '../examples/svg-phase-7.4.mjs';

test('SVG phase 7.4 example produces the same PDF from source and bundled APIs', () => {
  const normalize = bytes => Buffer.from(bytes).toString('latin1').replace(/\/CreationDate \(D:\d{14}Z\)/, '/CreationDate (D:20260929000000Z)');
  const bytes = generateSvgPhase74();
  assert.equal(normalize(bytes), normalize(generateSvgPhase74(source)));
  const pdf = normalize(generateSvgPhase74(source, false));
  assert.match(pdf, /1\.8333 0 0 1\.8333 /, 'a symbol viewBox is fitted into its use viewport');
  assert.match(pdf, /\/SMask << \/S \/Luminosity/);
  assert.match(pdf, /\(AB\) Tj[\s\S]*\(CD\) Tj[\s\S]*\(EF\) Tj/);
  assert.match(pdf, /\/ca 0\.502/);
  assert.doesNotMatch(pdf, /\n150 90 l\n/, 'the display:none layer is not drawn');
  assert.match(pdf, /\(rendered, not thrown\) Tj/);
  assert.doesNotMatch(pdf, /NaN|Infinity/);
});
