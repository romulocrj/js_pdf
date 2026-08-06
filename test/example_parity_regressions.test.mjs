/*
 * js_pdf upstream example parity regression tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as Pdf from '../src/index.ts';
import { latin1 } from "./support/pdf-text.mjs";


function context(width = 200, height = 200) {
  const document = new Pdf.Document();
  return {
    document,
    canvas: null,
    pageFormat: { width, height },
    pageNumber: 1,
    pagesCount: 1,
    theme: document.theme
  };
}

test('Align resolves named alignments instead of producing NaN offsets', () => {
  const box = new Pdf.Align({
    alignment: 'topLeft',
    child: new Pdf.SizedBox({ width: 40, height: 20 })
  }).layout(context(), { maxWidth: 200, maxHeight: 100 });

  assert.deepEqual([box.data.dx, box.data.dy], [0, 0]);
  assert.throws(
    () => new Pdf.Align({ alignment: 'sideways' }),
    /Unknown alignment/
  );
});

test('FullPage keeps a contained SVG at the physical page bottom', () => {
  const pageFormat = { width: 100, height: 100 };
  const pdf = latin1(Pdf.createPdf({}, () => new Pdf.Page({
    pageTheme: new Pdf.PageTheme({
      pageFormat,
      margin: 0,
      buildBackground: () => new Pdf.FullPage({
        ignoreMargins: true,
        child: new Pdf.SvgImage({
          svg: '<svg viewBox="0 0 100 20"><path d="M0 0h100v20H0z" fill="#ff0000"/></svg>'
        })
      })
    }),
    build: () => new Pdf.SizedBox()
  })));

  assert.match(pdf, /1 0 0 -1 0 20 cm/);
  assert.doesNotMatch(pdf, /NaN/);
});

test('PdfLogo treats 24 by 27 as intrinsic dimensions and scales to constraints', () => {
  const box = new Pdf.PdfLogo().layout(context(), {
    maxWidth: 120,
    maxHeight: 150
  });

  assert.deepEqual([box.width, box.height], [120, 135]);
});

test('TableOfContent preserves the upstream divider height', () => {
  const renderContext = context();
  renderContext.document.registerOutline({
    title: 'Chapter',
    level: 0,
    pageNumber: 1,
    y: 0
  });
  const box = new Pdf.TableOfContent().layout(renderContext, {
    maxWidth: 200,
    maxHeight: 200
  });

  assert.equal(box.height, 18);
});

test('Text applies line spacing between lines but not after the last line', () => {
  const renderContext = context();
  const style = new Pdf.TextStyle({ fontSize: 10, lineSpacing: 5 });
  const oneLine = new Pdf.Text('one', { style }).layout(renderContext, {
    maxWidth: 200,
    maxHeight: 200
  });
  const twoLines = new Pdf.Text('one\ntwo', { style }).layout(renderContext, {
    maxWidth: 200,
    maxHeight: 200
  });

  assert.ok(Math.abs(oneLine.height - 11.56) < 0.001);
  assert.ok(Math.abs(twoLines.height - 28.12) < 0.001);
});

test('Stateless paragraphs delegate immutable continuation to their text', () => {
  const paragraph = new Pdf.Paragraph({
    margin: 0,
    style: new Pdf.TextStyle({ fontSize: 10 }),
    text: Array.from({ length: 40 }, () => 'word').join(' ')
  });
  const first = paragraph.layoutSpan(
    context(),
    { maxWidth: 80, maxHeight: 30 },
    paragraph.initialSpanState()
  );

  assert.equal(first.hasMore, true);
  assert.ok(first.box.height <= 30);
  assert.ok(first.nextState.child !== null);
});

test('a non-spanning StatelessWidget moves intact to a fresh page', () => {
  class Atomic extends Pdf.StatelessWidget {
    build() {
      return new Pdf.SizedBox({ height: 40 });
    }
  }

  const pdf = latin1(Pdf.createPdf({}, () => new Pdf.MultiPage({
    pageFormat: { width: 100, height: 100 },
    margin: 10,
    build: () => [new Pdf.SizedBox({ height: 60 }), new Atomic()]
  })));

  assert.match(pdf, /\/Count 2\b/);
});

test('Column continuation advances at direct-child boundaries', () => {
  const column = new Pdf.Column({
    children: [
      new Pdf.SizedBox({ height: 40 }),
      new Pdf.SizedBox({ height: 40 }),
      new Pdf.SizedBox({ height: 40 })
    ]
  });
  const first = column.layoutSpan(
    context(),
    { maxWidth: 100, maxHeight: 70 },
    column.initialSpanState()
  );
  const second = column.layoutSpan(
    context(),
    { maxWidth: 100, maxHeight: 70 },
    first.nextState
  );

  assert.equal(first.hasMore, true);
  assert.equal(first.nextState.firstChild, 1);
  assert.equal(second.nextState.firstChild, 2);
});

test('MultiPage defaults to no implicit gap between body widgets', () => {
  const pdf = latin1(Pdf.createPdf({}, () => new Pdf.MultiPage({
    pageFormat: { width: 100, height: 100 },
    margin: 10,
    build: () => [
      new Pdf.SizedBox({ height: 40 }),
      new Pdf.SizedBox({ height: 40 })
    ]
  })));

  assert.match(pdf, /\/Count 1\b/);
});

test('MultiPage keeps a naturally fitting Column at its intrinsic height', () => {
  const pdf = latin1(Pdf.createPdf({}, () => new Pdf.MultiPage({
    pageFormat: { width: 100, height: 100 },
    margin: 10,
    build: () => [
      new Pdf.SizedBox({ height: 30 }),
      new Pdf.Column({
        children: [
          new Pdf.SizedBox({ height: 10 }),
          new Pdf.SizedBox({ height: 10 })
        ]
      }),
      new Pdf.SizedBox({ height: 30 })
    ]
  })));

  assert.match(pdf, /\/Count 1\b/);
});

test('MultiPage headers and footers receive global page numbers and total count', () => {
  const pageFormat = { width: 100, height: 100 };
  const document = new Pdf.Document();
  document.addPage(new Pdf.Page({
    pageFormat,
    margin: 0,
    build: () => new Pdf.SizedBox()
  }));
  document.addPage(new Pdf.MultiPage({
    pageFormat,
    margin: 10,
    footer: renderContext => new Pdf.Text(
      `P${renderContext.pageNumber}/${renderContext.pagesCount}`
    ),
    build: () => [
      new Pdf.SizedBox({ height: 50 }),
      new Pdf.SizedBox({ height: 50 })
    ]
  }));

  const pdf = latin1(document.save());
  assert.match(pdf, /\/Count 3\b/);
  assert.match(pdf, /\(P2\/3\) Tj/);
  assert.match(pdf, /\(P3\/3\) Tj/);
  assert.doesNotMatch(pdf, /undefined|NaN/);
});
