/*
 * js_pdf tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Tests may use Node APIs; src/ may not (enforced by tools/check-source.mjs).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as Pdf from '../src/index.ts';

function latin1(bytes) {
  let output = '';
  for (const byte of bytes) output += String.fromCharCode(byte);
  return output;
}

function assertClose(actual, expected, tolerance = 1e-12) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

test('createPdf returns a valid Uint8Array PDF with one page', () => {
  const bytes = Pdf.createPdf({}, () => [
    new Pdf.Page({
      build: () => new Pdf.Text('Hello js_pdf')
    })
  ]);

  assert.ok(bytes instanceof Uint8Array);
  const source = latin1(bytes);
  assert.match(source, /^%PDF-1\.7/);
  assert.match(source, /\/Type \/Page\b/);
  assert.match(source, /Hello js_pdf/);
  assert.match(source, /%%EOF\s*$/);
});

test('MultiPage creates additional physical pages when widgets overflow', () => {
  const bytes = Pdf.createPdf({}, () => new Pdf.MultiPage({
    margin: 40,
    gap: 4,
    build: () => Array.from({ length: 45 }, (_, index) =>
      new Pdf.Container({
        padding: 5,
        borderColor: '#cccccc',
        child: new Pdf.Text(`Linha ${index + 1}`, { fontSize: 12 })
      })
    )
  }));

  const source = latin1(bytes);
  const pageObjectCount = (source.match(/\/Type \/Page\b/g) ?? []).length;
  assert.ok(pageObjectCount >= 2);
  assert.match(source, /\/Count [2-9]/);
});

test('Text emits WinAnsi octal escapes for Portuguese accents', () => {
  const bytes = Pdf.createPdf({}, () => new Pdf.Page({
    build: () => new Pdf.Text('Relatório de execução')
  }));

  const source = latin1(bytes);
  assert.match(source, /Relat\\363rio/);
  assert.match(source, /execu\\347\\343o/);
});

test('Helvetica measures a known string with AFM advance widths', () => {
  const font = Pdf.PdfType1Font.helvetica();
  const metrics = font.stringMetrics('Hello', 12);

  assertClose(metrics.advanceWidth, 27.336);
  assertClose(metrics.width, 27.336);
  assertClose(metrics.ascent, 11.172);
  assertClose(metrics.descent, -2.7);
});

test('all 14 standard Type1 fonts can be selected for a document', () => {
  const fonts = [
    Pdf.PdfType1Font.courier(),
    Pdf.PdfType1Font.courierBold(),
    Pdf.PdfType1Font.courierBoldOblique(),
    Pdf.PdfType1Font.courierOblique(),
    Pdf.PdfType1Font.helvetica(),
    Pdf.PdfType1Font.helveticaBold(),
    Pdf.PdfType1Font.helveticaBoldOblique(),
    Pdf.PdfType1Font.helveticaOblique(),
    Pdf.PdfType1Font.times(),
    Pdf.PdfType1Font.timesBold(),
    Pdf.PdfType1Font.timesBoldItalic(),
    Pdf.PdfType1Font.timesItalic(),
    Pdf.PdfType1Font.symbol(),
    Pdf.PdfType1Font.zapfDingbats()
  ];

  assert.equal(fonts.length, 14);
  for (const font of fonts) {
    const bytes = Pdf.createPdf({ font }, () => new Pdf.Page({
      build: () => new Pdf.Text('Font metrics')
    }));
    const source = latin1(bytes);

    assert.match(source, new RegExp(`/BaseFont /${font.fontName}\\b`));
    assert.match(source, /BT \/F1 12 Tf/);
  }
});

test('Type1 font encoding and resource dictionary use the font seam', () => {
  const font = Pdf.PdfType1Font.timesBoldItalic();

  assert.equal(font.encodeText('Ação'), '(A\\347\\343o)');
  assert.match(font.resourceDict(), /\/Subtype \/Type1/);
  assert.match(font.resourceDict(), /\/BaseFont \/Times-BoldItalic/);
  assert.match(font.resourceDict(), /\/Encoding \/WinAnsiEncoding/);
});

test('the namespace export exposes the same API as the named exports', () => {
  for (const name of ['Document', 'Page', 'MultiPage', 'Text', 'Column', 'Row', 'Container', 'Spacer', 'Vector', 'PageFormat', 'PdfType1Font']) {
    assert.equal(Pdf.js_pdf[name], Pdf[name], `js_pdf.${name} must match the named export`);
  }
  assert.equal(typeof Pdf.js_pdf.createPdf, 'function');
});

test('a single widget taller than the content area is rejected', () => {
  assert.throws(
    () => Pdf.createPdf({}, () => new Pdf.MultiPage({
      build: () => [new Pdf.Container({ height: 5000 })]
    })),
    RangeError
  );
});
