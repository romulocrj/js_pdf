/*
 * js_pdf tests — phase 2.7 public SvgImage widget.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Tests may use Node APIs; src/ may not (enforced by tools/check-source.mjs).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import * as Pdf from '../src/index.ts';
import { PdfCanvas } from '../src/pdf/graphics.ts';
import { PageFormat } from '../src/pdf/page_format.ts';

const context = (height = 300) => {
  const document = new Pdf.Document();
  return {
    document,
    canvas: new PdfCanvas(height),
    pageFormat: { width: 200, height },
    pageNumber: 1,
    theme: document.theme
  };
};

const svg = '<svg viewBox="0 0 100 50"><rect width="100" height="50" fill="red"/></svg>';

test('SvgImage is exported through named, namespace and callback APIs', () => {
  assert.equal(typeof Pdf.SvgImage, 'function');
  assert.equal(Pdf.js_pdf.SvgImage, Pdf.SvgImage);

  let callbackConstructor = null;
  Pdf.createPdf({}, api => {
    callbackConstructor = api.SvgImage;
    return new api.Page({ build: () => new api.SvgImage({ svg, width: 100 }) });
  });
  assert.equal(callbackConstructor, Pdf.SvgImage);
});

test('contain preserves the viewBox aspect ratio inside finite constraints', () => {
  const image = new Pdf.SvgImage({ svg });
  const box = image.layout(context(), { maxWidth: 300, maxHeight: 200 });

  assert.equal(box.width, 300);
  assert.equal(box.height, 150);
  assert.deepEqual(box.data.source, { width: 100, height: 50 });
  assert.deepEqual(box.data.destination, { width: 300, height: 150 });
});

test('intrinsic dimensions and explicit dimensions drive the offered size', () => {
  const intrinsic = new Pdf.SvgImage({
    svg: '<svg width="40" height="20" viewBox="0 0 80 40"/>'
  }).layout(context(), { maxWidth: 500, maxHeight: 500 });
  const explicit = new Pdf.SvgImage({ svg, width: 120, height: 40, fit: 'fill' })
    .layout(context(), { maxWidth: 500, maxHeight: 500 });

  assert.deepEqual([intrinsic.width, intrinsic.height], [40, 20]);
  assert.deepEqual([explicit.width, explicit.height], [120, 40]);
});

test('cover crops the source and alignment chooses which edge survives', () => {
  const left = new Pdf.SvgImage({ svg, width: 50, height: 100, fit: 'cover', alignment: 'centerLeft' })
    .layout(context(), { maxWidth: 500, maxHeight: 500 });
  const right = new Pdf.SvgImage({ svg, width: 50, height: 100, fit: 'cover', alignment: 'centerRight' })
    .layout(context(), { maxWidth: 500, maxHeight: 500 });

  assert.deepEqual(left.data.source, { width: 25, height: 50 });
  assert.equal(left.data.sourceX, 0);
  assert.equal(right.data.sourceX, 75);
  assert.deepEqual(left.data.destination, { width: 50, height: 100 });
});

test('paint clips the widget box and flips SVG y into PDF space', () => {
  const render = context(300);
  const image = new Pdf.SvgImage({
    svg: '<svg viewBox="0 0 10 20"><rect width="10" height="20"/></svg>',
    width: 100,
    height: 200,
    fit: 'fill'
  });
  const box = image.layout(render, { maxWidth: 200, maxHeight: 300 });
  image.paint(render, { ...box, x: 5, y: 10 });
  const output = render.canvas.output().trim().split('\n');

  assert.deepEqual(output.slice(0, 4), ['q', '5 90 100 200 re', 'W n', '10 0 0 -10 5 290 cm']);
  assert.ok(output.includes('0 0 m'));
  assert.equal(output.at(-1), 'Q');
});

test('clip can be disabled and colorFilter recolours painted content', () => {
  const render = context();
  const image = new Pdf.SvgImage({ svg, width: 100, clip: false, colorFilter: '#0000ff' });
  const box = image.layout(render, { maxWidth: 200, maxHeight: 200 });
  image.paint(render, { ...box, x: 0, y: 0 });
  const output = render.canvas.output().trim().split('\n');

  assert.equal(output.some(line => line.startsWith('W')), false);
  assert.ok(output.includes('0 0 1 rg'));
  assert.ok(!output.includes('1 0 0 rg'));
});

test('all BoxFit modes return finite, non-negative fitted sizes', () => {
  for (const fit of ['fill', 'contain', 'cover', 'fitWidth', 'fitHeight', 'none', 'scaleDown']) {
    const box = new Pdf.SvgImage({ svg, width: 80, height: 90, fit })
      .layout(context(), { maxWidth: 500, maxHeight: 500 });
    for (const value of [
      box.width, box.height, box.data.source.width, box.data.source.height,
      box.data.destination.width, box.data.destination.height
    ]) {
      assert.ok(Number.isFinite(value) && value >= 0, `${fit} yielded ${value}`);
    }
  }
});

test('malformed markup and an unknown fit fail at the public boundary', () => {
  assert.throws(() => new Pdf.SvgImage({ svg: '<svg>' }), SyntaxError);
  assert.throws(
    () => new Pdf.SvgImage({ svg, fit: 'stretchy' }).layout(context(), { maxWidth: 100, maxHeight: 100 }),
    TypeError
  );
});

test('SvgImage serializes real path operators into a PDF', () => {
  const bytes = Pdf.createPdf({}, api => new api.Page({
    build: () => new api.SvgImage({ svg, width: 100 })
  }));
  let source = '';
  for (const byte of bytes) source += String.fromCharCode(byte);

  assert.match(source, /1 0 0 rg/);
  assert.match(source, /W n/);
  assert.match(source, / cm/);
});
