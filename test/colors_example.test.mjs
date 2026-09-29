/*
 * js_pdf phase 6.7 color gallery integration tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as source from '../src/index.ts';
import { generateColorsPhase67 } from '../examples/colors-phase-6.7.mjs';

test('color gallery produces the same PDF from source and bundled APIs', () => {
  const normalize = bytes => Buffer.from(bytes).toString('latin1').replace(/\/CreationDate \(D:\d{14}Z\)/, '/CreationDate (D:20260929000000Z)');
  const bytes = generateColorsPhase67();
  assert.equal(normalize(bytes), normalize(generateColorsPhase67(source)));
  const pdf = normalize(generateColorsPhase67(source, false));
  assert.match(pdf, /0\.25 g/);
  assert.match(pdf, /1 0 0 0 k/);
  assert.match(pdf, /DeviceRGB/);
  assert.doesNotMatch(pdf, /NaN|Infinity/);
});

test('color gallery follows performance in both browser and phase runner', () => {
  for (const file of ['Browser.html', 'run-phase-examples.mjs']) {
    const content = readFileSync(new URL('../examples/' + file, import.meta.url), 'utf8');
    assert.match(content, /import \{ generateColorsPhase67 \} from '.\/colors-phase-6\.7\.mjs'/);
    assert.match(content, /generateColorsPhase67\(/);
    assert.ok(content.lastIndexOf('colors-phase-6.7') > content.lastIndexOf('layout-performance-phase-6.6'));
  }
});
