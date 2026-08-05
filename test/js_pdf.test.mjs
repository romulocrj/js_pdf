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

test('the namespace export exposes the same API as the named exports', () => {
  for (const name of ['Document', 'Page', 'MultiPage', 'Text', 'Column', 'Row', 'Container', 'Spacer', 'Vector', 'PageFormat']) {
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
