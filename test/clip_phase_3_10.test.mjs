/*
 * js_pdf clipping-widgets phase 3.10 tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as Pdf from '../src/index.ts';

function source(bytes) {
  return String.fromCharCode(...bytes);
}

test('phase 3.10 constructors are on named, namespace and callback APIs', () => {
  for (const name of ['ClipRect', 'ClipRRect', 'ClipOval']) {
    assert.equal(typeof Pdf[name], 'function', name);
    assert.equal(Pdf.js_pdf[name], Pdf[name], `js_pdf.${name}`);
  }

  const bytes = Pdf.createPdf({}, api => new api.Page({
    build: () => new api.ClipRect({
      child: new api.Container({ width: 30, height: 20, background: '#ff0000' })
    })
  }));
  assert.match(source(bytes), /re\nW n/);
});

test('ClipRect scopes its child inside a rectangular clip path', () => {
  const pdf = source(Pdf.createPdf({}, () => new Pdf.Page({
    build: () => new Pdf.ClipRect({
      child: new Pdf.Container({ width: 80, height: 50, background: '#00ff00' })
    })
  })));
  assert.match(pdf, /q\n.* re\nW n\n0 1 0 rg .* re f\nQ/s);
});

test('ClipOval emits four curves before clipping', () => {
  const pdf = source(Pdf.createPdf({}, () => new Pdf.Page({
    build: () => new Pdf.ClipOval({
      child: new Pdf.Container({ width: 90, height: 50, background: '#0000ff' })
    })
  })));
  const clipped = pdf.slice(pdf.indexOf('q\n'), pdf.indexOf('W n'));
  assert.equal((clipped.match(/ c/g) ?? []).length, 4);
  assert.match(pdf, /W n\n0 0 1 rg/);
});

test('ClipRRect scales oversized elliptical radii to a valid path', () => {
  const pdf = source(Pdf.createPdf({}, () => new Pdf.Page({
    build: () => new Pdf.ClipRRect({
      horizontalRadius: 100,
      verticalRadius: 80,
      child: new Pdf.Container({ width: 60, height: 30, background: '#ff00ff' })
    })
  })));
  assert.match(pdf, / c\n.* l\n.* c\n.*W n/s);
  assert.doesNotMatch(pdf, /NaN|Infinity/);
});

test('clip widgets preserve the child layout size', () => {
  const document = new Pdf.Document();
  const context = {
    document,
    canvas: null,
    pageFormat: { width: 200, height: 200 },
    pageNumber: 1,
    theme: document.theme
  };
  for (const widget of [
    new Pdf.ClipRect({ child: new Pdf.SizedBox({ width: 45, height: 31 }) }),
    new Pdf.ClipRRect({ child: new Pdf.SizedBox({ width: 45, height: 31 }) }),
    new Pdf.ClipOval({ child: new Pdf.SizedBox({ width: 45, height: 31 }) })
  ]) {
    const box = widget.layout(context, { maxWidth: 100, maxHeight: 100 });
    assert.deepEqual([box.width, box.height], [45, 31]);
  }
});

