/*
 * js_pdf tests — phase 2.8 PDF shading patterns and SVG gradients.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Tests may use Node APIs; src/ may not (enforced by tools/check-source.mjs).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as Pdf from '../src/index.ts';
import { PdfBaseFunction } from '../src/pdf/obj/function.ts';
import { PdfShading } from '../src/pdf/obj/shading.ts';
import { PdfShadingPattern } from '../src/pdf/obj/pattern.ts';

const latin1 = bytes => {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return value;
};

const pdfFor = svg => latin1(Pdf.createPdf({}, api => new api.Page({
  margin: 0,
  build: () => new api.SvgImage({ svg, width: 200, height: 200, fit: 'fill' })
})));

test('two colours use an exponential interpolation function', () => {
  const fn = PdfBaseFunction.colorsAndStops([[1, 0, 0], [0, 0, 1]], [0, 1]);
  assert.equal(
    fn.toString(),
    '<< /FunctionType 2 /Domain [0 1] /C0 [1 0 0] /C1 [0 0 1] /N 1 >>'
  );
});

test('three or more stops use a stitching function with bounds', () => {
  const fn = PdfBaseFunction.colorsAndStops(
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    [0, 0.25, 1]
  ).toString();

  assert.match(fn, /\/FunctionType 3/);
  assert.match(fn, /\/Bounds \[0\.25\]/);
  assert.match(fn, /\/Encode \[0 1 0 1\]/);
  assert.equal((fn.match(/\/FunctionType 2/g) ?? []).length, 2);
});

test('a shading pattern serializes axial coordinates and its matrix', () => {
  const shading = new PdfShading({
    type: 'axial',
    fn: PdfBaseFunction.colorsAndStops([[0, 0, 0], [1, 1, 1]], [0, 1]),
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
    extendStart: true,
    extendEnd: true
  });
  const pattern = new PdfShadingPattern({ shading, matrix: [2, 0, 0, 3, 10, 20] });
  const value = pattern.output().toString();

  assert.match(value, /\/PatternType 2/);
  assert.match(value, /\/Shading << \/ShadingType 2/);
  assert.match(value, /\/Coords \[0 0 1 0\]/);
  assert.match(value, /\/Matrix \[2 0 0 3 10 20\]/);
});

test('a linear SVG gradient becomes a page Pattern resource and scn operator', () => {
  const source = pdfFor(`
    <svg viewBox="0 0 100 100">
      <defs><linearGradient id="g"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs>
      <rect x="10" y="20" width="30" height="40" fill="url(#g)"/>
    </svg>
  `);

  assert.match(source, /\/Pattern cs \/p1 scn/);
  assert.match(source, /\/Pattern << \/p1 << \/PatternType 2/);
  assert.match(source, /\/ShadingType 2/);
  assert.match(source, /\/Coords \[0 0 1 0\]/);
  assert.match(source, /\/Matrix \[60 0 0 -80 20 801\.89\]/);
});

test('a radial gradient emits radial coordinates', () => {
  const source = pdfFor(`
    <svg viewBox="0 0 100 100"><defs>
      <radialGradient id="g" cx=".5" cy=".5" r=".5" fx=".25" fy=".25" fr=".1">
        <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#000000"/>
      </radialGradient>
    </defs><circle cx="50" cy="50" r="40" fill="url(#g)"/></svg>
  `);

  assert.match(source, /\/ShadingType 3/);
  assert.match(source, /\/Coords \[0\.25 0\.25 0\.1 0\.5 0\.5 0\.5\]/);
});

test('userSpaceOnUse and gradientTransform keep document coordinates', () => {
  const source = pdfFor(`
    <svg viewBox="0 0 100 100"><defs>
      <linearGradient id="g" gradientUnits="userSpaceOnUse" x1="10" y1="20" x2="90" y2="20"
        gradientTransform="translate(5 6)">
        <stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/>
      </linearGradient>
    </defs><rect x="20" y="30" width="50" height="40" fill="url(#g)"/></svg>
  `);

  assert.match(source, /\/Coords \[10 20 90 20\]/);
  assert.match(source, /\/Matrix \[2 0 0 -2 10 829\.89\]/);
});

test('gradient href inherits stops while local coordinates win', () => {
  const source = pdfFor(`
    <svg xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100"><defs>
      <linearGradient id="base"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient>
      <linearGradient id="child" x1=".25" x2=".75" xlink:href="#base"/>
    </defs><rect width="100" height="100" fill="url(#child)"/></svg>
  `);

  assert.match(source, /\/Coords \[0\.25 0 0\.75 0\]/);
  assert.match(source, /\/C0 \[1 0 0\]/);
  assert.match(source, /\/C1 \[0 0 1\]/);
});

test('a gradient paint server remains inherited through a group', () => {
  const source = pdfFor(`
    <svg viewBox="0 0 100 100"><defs><linearGradient id="g">
      <stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/>
    </linearGradient></defs><g fill="url(#g)"><rect x="10" y="20" width="30" height="40"/></g></svg>
  `);

  assert.match(source, /\/Pattern cs \/p1 scn/);
  assert.match(source, /\/PatternType 2/);
});

test('a gradient can stroke, and a color filter still produces a solid fill', () => {
  const gradient = `
    <svg viewBox="0 0 10 10"><defs><linearGradient id="g">
      <stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/>
    </linearGradient></defs><path d="M0 0L10 10" fill="none" stroke="url(#g)"/></svg>
  `;
  const strokeSource = pdfFor(gradient);
  assert.match(strokeSource, /\/Pattern CS \/p1 SCN/);

  const bytes = Pdf.createPdf({}, api => new api.Page({
    build: () => new api.SvgImage({ svg: gradient, width: 100, colorFilter: '#00ff00' })
  }));
  const filtered = latin1(bytes);
  assert.doesNotMatch(filtered, /\/PatternType 2/);
  assert.match(filtered, /0 1 0 RG/);
});

test('the real invoice and document gradient assets serialize end to end', () => {
  for (const name of ['invoice.svg', 'document.svg']) {
    const svg = readFileSync(new URL(`../examples/assets/${name}`, import.meta.url), 'utf8');
    const source = pdfFor(svg);
    assert.match(source, /\/PatternType 2/, `${name} emitted no shading pattern`);
    assert.match(source, /\/FunctionType [23]/, `${name} emitted no gradient function`);
  }
});
