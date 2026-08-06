/*
 * js_pdf tests — mixed page orientations and paper sizes in one document.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Tests may use Node APIs; src/ may not (enforced by tools/check-source.mjs).
 *
 * Every physical page carries its own `/MediaBox`, so a document may mix
 * orientations and paper sizes freely. These lock that in: it is a property of
 * the pipeline (nothing holds a document-wide page size), and a regression that
 * introduced one would be silent — the PDF would still open, just at the wrong
 * size.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as Pdf from '../src/index.ts';
import { latin1 } from "./support/pdf-text.mjs";


/** The `/MediaBox` of each page, in document order. */
const mediaBoxes = bytes =>
  [...latin1(bytes).matchAll(/\/MediaBox \[([^\]]*)\]/g)].map(match => match[1]);

const A4_PORTRAIT = '0 0 595.28 841.89';
const A4_LANDSCAPE = '0 0 841.89 595.28';
const LETTER_PORTRAIT = '0 0 612 792';
const LETTER_LANDSCAPE = '0 0 792 612';

test('one document holds pages of different orientations', () => {
  const bytes = Pdf.createPdf({}, api => [
    new api.Page({ pageFormat: api.PageFormat.A4, build: () => new api.Text('cover') }),
    new api.Page({
      pageFormat: api.PageFormat.A4,
      orientation: 'landscape',
      build: () => new api.Text('wide table')
    }),
    new api.Page({ pageFormat: api.PageFormat.A4, build: () => new api.Text('appendix') })
  ]);

  assert.deepEqual(mediaBoxes(bytes), [A4_PORTRAIT, A4_LANDSCAPE, A4_PORTRAIT]);
});

test('one document holds pages of different paper sizes', () => {
  const bytes = Pdf.createPdf({}, api => [
    new api.Page({ pageFormat: api.PageFormat.A4, build: () => new api.Text('a') }),
    new api.Page({ pageFormat: api.PageFormat.LETTER, build: () => new api.Text('b') })
  ]);

  assert.deepEqual(mediaBoxes(bytes), [A4_PORTRAIT, LETTER_PORTRAIT]);
});

test('orientation given on a PageTheme reaches the MediaBox', () => {
  const bytes = Pdf.createPdf({}, api => [
    new api.Page({
      pageTheme: new api.PageTheme({ pageFormat: api.PageFormat.A4, orientation: 'landscape' }),
      build: () => new api.Text('wide')
    })
  ]);

  assert.deepEqual(mediaBoxes(bytes), [A4_LANDSCAPE]);
});

test('portrait leaves an already-portrait paper alone and turns a landscape one', () => {
  const landscapeA4 = { width: 841.89, height: 595.28 };

  const bytes = Pdf.createPdf({}, api => [
    new api.Page({ pageFormat: api.PageFormat.A4, orientation: 'portrait', build: () => new api.Text('a') }),
    new api.Page({ pageFormat: landscapeA4, orientation: 'portrait', build: () => new api.Text('b') }),
    new api.Page({ pageFormat: landscapeA4, orientation: 'natural', build: () => new api.Text('c') })
  ]);

  assert.deepEqual(mediaBoxes(bytes), [A4_PORTRAIT, A4_PORTRAIT, A4_LANDSCAPE]);
});

test('the render context reports the rotated paper to the body', () => {
  // This is what makes the rotation real rather than a MediaBox edit: a widget
  // asking `context.pageFormat` during layout sees the landscape dimensions, so
  // anything sizing itself against the page follows the turn.
  let seen = null;

  Pdf.createPdf({}, api => [
    new api.Page({
      pageFormat: api.PageFormat.A4,
      orientation: 'landscape',
      margin: 40,
      build: context => {
        seen = context.pageFormat;
        return new api.Text('x');
      }
    })
  ]);

  assert.deepEqual(seen, { width: 841.89, height: 595.28 });
});

test('a landscape page offers its body the wider content area', () => {
  let width = 0;

  Pdf.createPdf({}, api => [
    new api.Page({
      pageFormat: api.PageFormat.A4,
      orientation: 'landscape',
      margin: 40,
      build: context => {
        // An aligned Container fills the constraint it is handed — upstream
        // wraps the child in an Align, which expands on a bounded axis — so its
        // width is the resolved page width less the margins.
        const container = new api.Container({ alignment: 'center', child: new api.Text('x') });
        width = container.layout(context, {
          maxWidth: context.pageFormat.width - 80,
          maxHeight: context.pageFormat.height - 80
        }).width;
        return container;
      }
    })
  ]);

  assert.equal(Math.round(width), Math.round(841.89 - 80));
});

test('MultiPage takes an orientation, and every page it emits carries it', () => {
  const bytes = Pdf.createPdf({}, api => [
    new api.Page({ pageFormat: api.PageFormat.A4, build: () => new api.Text('cover') }),
    new api.MultiPage({
      pageFormat: api.PageFormat.A4,
      orientation: 'landscape',
      margin: 40,
      build: () => Array.from({ length: 60 }, (_, index) =>
        new api.Container({ padding: 6, child: new api.Text(`row ${index + 1}`) })
      )
    })
  ]);

  const boxes = mediaBoxes(bytes);
  assert.equal(boxes[0], A4_PORTRAIT, 'the cover stays portrait');
  assert.ok(boxes.length >= 3, 'the landscape section must have overflowed');
  for (const box of boxes.slice(1)) {
    assert.equal(box, A4_LANDSCAPE);
  }
});

test('MultiPage inherits its build context and page layers from PageTheme', () => {
  const theme = Pdf.ThemeData.withFont({ base: Pdf.Font.courier() });
  let seenTheme = null;
  const bytes = Pdf.createPdf({}, api => new api.MultiPage({
    pageTheme: new api.PageTheme({
      pageFormat: api.PageFormat.LETTER,
      orientation: 'landscape',
      margin: 20,
      theme,
      buildBackground: () => new api.Container({ width: 20, height: 20, background: '#00ff00' }),
      buildForeground: () => new api.Container({ width: 10, height: 10, background: '#0000ff' })
    }),
    build: context => {
      seenTheme = api.Theme.of(context);
      return [new api.Text('themed multipage')];
    }
  }));

  const source = latin1(bytes);
  assert.equal(seenTheme, theme);
  assert.deepEqual(mediaBoxes(bytes), [LETTER_LANDSCAPE]);
  assert.match(source, /\/BaseFont \/Courier\b/);
  assert.ok(source.indexOf('0 1 0 rg') < source.indexOf('BT '));
  assert.ok(source.indexOf('BT ') < source.indexOf('0 0 1 rg'));
});

test('margins rotate with the paper', () => {
  const theme = new Pdf.PageTheme({
    pageFormat: Pdf.PageFormat.A4,
    orientation: 'landscape',
    margin: { left: 10, top: 20, right: 30, bottom: 40 }
  });

  // The left margin of the rotated page is the bottom margin of the declared
  // one, so a caller's asymmetric margins follow the content around the turn.
  assert.deepEqual(theme.margin, { left: 40, top: 10, right: 20, bottom: 30 });
});

test('a section reports the format it will actually be written at', () => {
  const page = new Pdf.Page({
    pageFormat: Pdf.PageFormat.A4,
    orientation: 'landscape',
    build: () => new Pdf.Text('x')
  });
  assert.deepEqual(page.format, { width: 841.89, height: 595.28 });

  const section = new Pdf.MultiPage({
    pageFormat: Pdf.PageFormat.A4,
    orientation: 'landscape',
    build: () => []
  });
  assert.deepEqual(section.format, { width: 841.89, height: 595.28 });
});
