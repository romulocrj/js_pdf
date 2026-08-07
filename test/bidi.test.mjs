/*
 * js_pdf Arabic shaping and bidi regression tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { shapeArabicVisual } from '../src/pdf/font/arabic.ts';
import { logicalToVisual } from '../src/pdf/font/bidi_utils.ts';

test('Arabic shaping selects connected forms and the lam-alef ligature', () => {
  assert.deepEqual(
    Array.from(shapeArabicVisual('سلام'), character => character.codePointAt(0)),
    [0x0645, 0xfefc, 0xfeb3]
  );
});

test('RTL conversion reverses Hebrew while preserving Latin and digits', () => {
  assert.equal(logicalToVisual('שלום'), 'םולש');
  assert.equal(logicalToVisual('مرحبا world 123'), 'world 123 ﺎﺒﺣﺮﻣ');
  assert.equal(logicalToVisual('rtl scope'), 'rtl scope');
});

test('Arabic combining marks stay attached without consuming advance order', () => {
  const visual = logicalToVisual('بَت');
  assert.equal(Array.from(visual).length, 3);
  assert.equal(Array.from(visual)[1], 'َ');
  assert.equal(Array.from(visual)[2], 'ﺑ');
});
