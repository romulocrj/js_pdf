/*
 * js_pdf placeholders phase 3.9 tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as Pdf from '../src/index.ts';

import { latin1 as source } from './support/pdf-text.mjs';

test('phase 3.9 constructors are on named, namespace and callback APIs', () => {
  for (const name of ['Placeholder', 'PdfLogo', 'FlutterLogo', 'LoremText', 'Lorem']) {
    assert.equal(typeof Pdf[name], 'function', name);
    assert.equal(Pdf.js_pdf[name], Pdf[name], `js_pdf.${name}`);
  }

  const bytes = Pdf.createPdf({}, api => new api.Page({
    build: () => new api.Row({
      children: [new api.PdfLogo(), new api.Lorem({ length: 4 })]
    })
  }));
  assert.match(source(bytes), /\(.*\) Tj/);
});

test('LoremText is deterministic and emits exactly the requested word count', () => {
  const first = new Pdf.LoremText().paragraph(37);
  const second = new Pdf.LoremText().paragraph(37);
  assert.equal(first, second);
  assert.equal(first.split(/\s+/u).length, 37);
  assert.match(first, /^[A-Z]/);
  assert.match(first, /\.$/);
});

test('LoremText can select the final word in the dictionary', () => {
  const random = { nextInt: maximum => maximum - 1 };
  assert.equal(new Pdf.LoremText({ random }).word(), 'voluptate');
});

test('Lorem keeps generated text stable across repeated layout', () => {
  let calls = 0;
  const lorem = new Pdf.Lorem({
    length: 12,
    random: { nextInt: maximum => (calls++ % maximum) }
  });
  const callsAfterConstruction = calls;
  const document = new Pdf.Document();
  const context = {
    document,
    canvas: null,
    pageFormat: { width: 200, height: 200 },
    pageNumber: 1,
    theme: document.theme
  };
  const first = lorem.layout(context, { maxWidth: 120, maxHeight: 200 });
  const second = lorem.layout(context, { maxWidth: 120, maxHeight: 200 });
  assert.equal(calls, callsAfterConstruction);
  assert.deepEqual(first, second);
});

test('PdfLogo paints the upstream Bézier shape in the requested colour', () => {
  const bytes = Pdf.createPdf({}, () => new Pdf.Page({
    build: () => new Pdf.SizedBox({
      width: 120,
      height: 120,
      child: new Pdf.PdfLogo({ color: '#0000ff' })
    })
  }));
  const pdf = source(bytes);
  assert.match(pdf, /0 0 1 rg/);
  assert.match(pdf, / c(?:\n| )/);
  assert.match(pdf, /f\nQ/);
});

test('Placeholder uses finite fallbacks and paints a box with both diagonals', () => {
  const placeholder = new Pdf.Placeholder({ fallbackWidth: 80, fallbackHeight: 60 });
  const document = new Pdf.Document();
  const context = {
    document,
    canvas: null,
    pageFormat: { width: 200, height: 200 },
    pageNumber: 1,
    theme: document.theme
  };
  const box = placeholder.layout(context, { maxWidth: Infinity, maxHeight: Infinity });
  assert.deepEqual([box.width, box.height], [80, 60]);

  const pdf = source(Pdf.createPdf({}, () => new Pdf.Page({
    build: () => new Pdf.SizedBox({ width: 80, height: 60, child: placeholder })
  })));
  assert.ok((pdf.match(/ m .* l S/g) ?? []).length >= 2);
});

