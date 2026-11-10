/*
 * js_pdf phase 7.5 graphics, colours and images example tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as source from '../src/index.ts';
import { generateGraphicsPhase75 } from '../examples/graphics-phase-7.5.mjs';
import { latin1 } from './support/pdf-text.mjs';

const normalize = bytes => Buffer.from(bytes).toString('latin1').replace(/\/CreationDate \(D:\d{14}Z\)/, '/CreationDate (D:20261110000000Z)');

test('graphics example produces the same PDF from source and bundled APIs', () => {
  const bytes = generateGraphicsPhase75();
  assert.equal(normalize(bytes), normalize(generateGraphicsPhase75(source)));
  const pdf = latin1(generateGraphicsPhase75(source, false));
  assert.match(pdf, /\/Count 2/);
  // Colour alpha, nested Opacity (0.25) and alpha 0 all reach /ExtGState.
  assert.match(pdf, /\/ca 0\.25/);
  assert.match(pdf, /\/ca 0 /);
  assert.match(pdf, /\/CA 0\.5 \/ca 0\.5/);
  // The Adobe transform-0 CMYK JPEG keeps its inverting /Decode array.
  assert.match(pdf, /\/DeviceCMYK \/Decode \[1 0 1 0 1 0 1 0\]/);
  assert.doesNotMatch(pdf, /NaN|Infinity/);
});

test('the colorAlpha: false column paints what such a document paints', () => {
  const { Document, Page, Row, Container, BoxDecoration, PdfColors } = source;
  const render = (colorAlpha, color) => {
    const document = new Document({ compress: false, colorAlpha });
    document.addPage(new Page({ build: () => new Row({ children: [0.25, 0.5, 0.75].map(alpha =>
      new Container({ width: 72, height: 36, decoration: new BoxDecoration({ color: color(alpha) }) })) }) }));
    return normalize(document.save());
  };
  const opaque = render(true, alpha => PdfColors.teal.withAlpha(alpha).withAlpha(1));
  assert.equal(render(false, alpha => PdfColors.teal.withAlpha(alpha)), opaque);
  assert.notEqual(render(true, alpha => PdfColors.teal.withAlpha(alpha)), opaque);
});
