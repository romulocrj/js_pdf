/*
 * js_pdf annotation and link phase 5.3 tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as Pdf from '../src/index.ts';

const source = bytes => String.fromCharCode(...bytes);

test('phase 5.3 annotation APIs are named, namespaced and callback-visible', () => {
  for (const name of [
    'Anchor',
    'Annotation',
    'AnnotationBuilder',
    'AnnotationLink',
    'AnnotationUrl',
    'Link',
    'UrlLink'
  ]) {
    assert.equal(typeof Pdf[name], 'function', name);
    assert.equal(Pdf.js_pdf[name], Pdf[name], `js_pdf.${name}`);
  }

  const pdf = source(Pdf.createPdf({}, api => new api.Page({
    margin: 0,
    build: () => new api.UrlLink({
      destination: 'https://example.com/callback',
      child: new api.SizedBox({ width: 40, height: 20 })
    })
  })));
  assert.match(pdf, /\/URI \(https:\/\/example\.com\/callback\)/);
});

test('UrlLink writes a printable borderless page annotation with widget coordinates', () => {
  const pdf = source(Pdf.createPdf({}, () => new Pdf.Page({
    pageFormat: { width: 200, height: 300 },
    margin: 0,
    build: () => new Pdf.UrlLink({
      destination: 'https://example.com/a)b',
      child: new Pdf.SizedBox({ width: 40, height: 20 })
    })
  })));

  assert.match(pdf, /\/Annots \[\d+ 0 R\]/);
  assert.match(pdf, /\/Type \/Annot \/Subtype \/Link \/Rect \[0 280 40 300\]/);
  assert.match(pdf, /\/Border \[0 0 0\] \/F 4/);
  assert.match(pdf, /\/A << \/S \/URI \/URI \(https:\/\/example\.com\/a\\\)b\) >>/);
});

test('RichText inherits AnnotationUrl and emits one rectangle per painted run', () => {
  const pdf = source(Pdf.createPdf({}, () => new Pdf.Page({
    margin: 0,
    build: () => new Pdf.RichText({
      text: new Pdf.TextSpan({
        annotation: new Pdf.AnnotationUrl('https://example.com/inline'),
        children: [new Pdf.TextSpan({ text: 'one ' }), new Pdf.TextSpan({ text: 'two' })]
      })
    })
  })));

  assert.equal((pdf.match(/\/URI \(https:\/\/example\.com\/inline\)/g) ?? []).length, 2);
  assert.equal((pdf.match(/\/Subtype \/Link/g) ?? []).length, 2);
});

test('Anchor and Link serialize a named destination and a GoTo action', () => {
  const document = new Pdf.Document();
  document.addPage(new Pdf.Page({
    pageFormat: { width: 200, height: 300 },
    margin: 0,
    build: () => new Pdf.Transform({
      translate: { x: 10, y: 20 },
      child: new Pdf.Anchor({
        name: 'details',
        setX: true,
        zoom: 1.5,
        child: new Pdf.Text('Destination')
      })
    })
  }));
  document.addPage(new Pdf.Page({
    pageFormat: { width: 200, height: 300 },
    margin: 0,
    build: () => new Pdf.Link({
      destination: 'details',
      child: new Pdf.Text('Jump')
    })
  }));

  const pdf = source(document.save());
  assert.match(pdf, /\/Dests << \/Names \[\(details\) << \/D \[\d+ 0 R \/XYZ 10 280 1\.5\] >>\]/);
  assert.match(pdf, /\/A << \/S \/GoTo \/D \(details\) >>/);
});

test('annotation rectangles follow the active widget transform', () => {
  const pdf = source(Pdf.createPdf({}, () => new Pdf.Page({
    pageFormat: { width: 200, height: 300 },
    margin: 0,
    build: () => new Pdf.Transform({
      translate: { x: 10, y: 20 },
      child: new Pdf.UrlLink({
        destination: 'https://example.com/moved',
        child: new Pdf.SizedBox({ width: 40, height: 20 })
      })
    })
  })));

  assert.match(pdf, /\/Rect \[10 260 50 280\]/);
});
