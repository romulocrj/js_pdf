/*
 * js_pdf translucent gradient stop tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

// A PDF shading function has no alpha channel, so the stop alphas of a widget
// gradient travel in a luminosity soft mask that repeats the same shading in
// gray, the way the SVG painter already handles stop-opacity.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as pw from '../src/index.ts';
import { latin1 } from './support/pdf-text.mjs';

const red = alpha => new pw.PdfColor(1, 0, 0, alpha);
const blue = alpha => new pw.PdfColor(0, 0, 1, alpha);
const gradients = (first, second) => [
  new pw.LinearGradient({ colors: [first, second] }),
  new pw.RadialGradient({ colors: [first, second], focal: pw.Alignment.topLeft })
];
const pdf = (gradient, options = {}) => latin1(pw.createPdf({ compress: false, ...options }, () => new pw.Page({
  pageFormat: { width: 200, height: 100 }, margin: 0,
  build: () => new pw.Container({ width: 200, height: 100, decoration: new pw.BoxDecoration({ gradient }) })
})));

test('translucent stops of a multi-colour gradient paint through a luminosity soft mask', () => {
  for (const gradient of gradients(red(0.25), blue(1))) {
    const out = pdf(gradient);
    assert.match(out, /\/SMask/, gradient.constructor.name);
    assert.match(out, /\/S \/Luminosity/);
    assert.match(out, /\/C0 \[0\.25 0\.25 0\.25\]/, 'the mask ramps the stop alphas in gray');
    assert.match(out, /\/C1 \[1 1 1\]/);
    assert.match(out, /\/C0 \[1 0 0\]/, 'the colour shading itself is unchanged');
  }
});

test('opaque gradients and colorAlpha: false keep a plain shading', () => {
  for (const gradient of gradients(red(1), blue(1))) assert.doesNotMatch(pdf(gradient), /\/SMask/);
  for (const gradient of gradients(red(0.25), blue(0.5))) {
    assert.doesNotMatch(pdf(gradient, { colorAlpha: false }), /\/SMask/);
  }
});
