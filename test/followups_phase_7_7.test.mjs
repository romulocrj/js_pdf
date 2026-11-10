/*
 * js_pdf tests — phase 7.7 follow-up fixes.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Tests may use Node APIs; src/ may not (enforced by tools/check-source.mjs).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import * as Pdf from '../src/index.ts';
import { latin1 } from './support/pdf-text.mjs';

function context(width = 600, height = 800) {
  const document = new Pdf.Document();
  return {
    document,
    canvas: null,
    pageFormat: { width, height },
    pageNumber: 1,
    theme: document.theme
  };
}

function render(build, options = {}) {
  const document = new Pdf.Document({ compress: false, ...options });
  document.addPage(new Pdf.Page({ build }));
  return latin1(document.save());
}

const SMALL_PAGE = {
  width: 300,
  height: 400,
  marginTop: 20,
  marginBottom: 20,
  marginLeft: 20,
  marginRight: 20
};

/** The content stream of every page, in page order. */
function pageStreams(pdf) {
  return [...pdf.matchAll(/stream\n([\s\S]*?)\nendstream/g)]
    .map(match => match[1])
    .filter(stream => /\b(Tj|TJ|re)\b/.test(stream));
}

function multiPage(build) {
  const document = new Pdf.Document({ compress: false });
  document.addPage(new Pdf.MultiPage({ pageFormat: SMALL_PAGE, build }));
  return latin1(document.save());
}

function pageCount(pdf) {
  return (pdf.match(/\/Type \/Page\b/g) ?? []).length;
}

const lines = count => Array.from({ length: count }, (_, index) => new Pdf.Text(`line ${index}`));

// ------------------------------------------------------- 1. Container.color

test('Container accepts upstream color as its background fill', () => {
  const pdf = render(() => new Pdf.Container({ width: 50, height: 50, color: '#ff0000' }));
  assert.match(pdf, /1 0 0 rg\n?\s*\S+ \S+ 50 50 re f/);
});

test('Container background stays a compatible alias of color', () => {
  const color = render(() => new Pdf.Container({ width: 50, height: 50, color: '#00ff00' }));
  const background = render(() => new Pdf.Container({ width: 50, height: 50, background: '#00ff00' }));
  const strip = pdf => pdf.replace(/\/CreationDate \(D:\d{14}Z\)/, '');
  assert.equal(strip(color), strip(background));
  assert.equal(new Pdf.Container({ color: '#00ff00' }).background.join(','), [0, 1, 0].join(','));
});

test('Container rejects color together with background or decoration', () => {
  assert.throws(() => new Pdf.Container({ color: '#ff0000', background: '#ff0000' }), /color.*background/);
  assert.throws(() => new Pdf.Container({ color: '#ff0000', decoration: { color: '#ff0000' } }), /decoration/);
  assert.throws(() => new Pdf.Container({ background: '#ff0000', decoration: { color: '#ff0000' } }), /decoration/);
});

// ------------------------------------------- 2. the last fragment of a split

test('the last fragment of a split aligned Container takes only its content height', () => {
  const pdf = multiPage(() => [
    new Pdf.Container({
      alignment: 'topLeft',
      decoration: { color: '#eeeeee' },
      child: new Pdf.Table({ children: lines(40).map(text => new Pdf.TableRow({ children: [text] })) })
    }),
    new Pdf.Text('AFTER')
  ]);
  assert.equal(pageCount(pdf), 2);
  const second = pageStreams(pdf)[1];
  assert.match(second, /\(AFTER\) Tj/);
  // The decoration of the tail fragment is as tall as its rows, not the page.
  const [, height] = /^0\.9333 0\.9333 0\.9333 rg \S+ \S+ \S+ (\S+) re f/.exec(second) ?? [];
  const rows = new Pdf.Text('line 0').layout(context(), new Pdf.BoxConstraints()).height * 15;
  assert.equal(Number(height).toFixed(2), rows.toFixed(2));
});

test('the last fragment of a split Column does not fill the rest of its page', () => {
  for (const mainAxisSize of ['max', 'min']) {
    const pdf = multiPage(() => [new Pdf.Column({ mainAxisSize, children: lines(40) }), new Pdf.Text('AFTER')]);
    assert.equal(pageCount(pdf), 2, mainAxisSize);
    assert.match(pageStreams(pdf)[1], /\(AFTER\) Tj/);
  }
});

test('an intermediate fragment of an aligned Container still fills its page, as upstream', () => {
  const container = new Pdf.Container({ alignment: 'topLeft', child: new Pdf.Column({ children: lines(60) }) });
  const fragment = container.layoutSpan(context(), new Pdf.BoxConstraints({ maxWidth: 200, maxHeight: 300 }),
    container.initialSpanState());
  assert.equal(fragment.hasMore, true);
  assert.equal(fragment.box.height, 300);
});

// --------------------------------------------- 3. Table under a tight width

const LOREM = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod '
  + 'tempor incididunt ut labore et dolore magna aliqua';

function wordsTable(right = LOREM) {
  return new Pdf.Table({
    children: [new Pdf.TableRow({ children: [new Pdf.Text('ATLANTICA'), new Pdf.Text(right)] })]
  });
}

test('intrinsic Table columns do not turn equal under a tight width', () => {
  const loose = wordsTable().layout(context(), { maxWidth: 200, maxHeight: 500 }).data.columnWidths;
  const tight = wordsTable()
    .layout(context(), new Pdf.BoxConstraints({ minWidth: 200, maxWidth: 200, maxHeight: 500 }))
    .data.columnWidths;
  assert.notEqual(tight[0], tight[1]);
  assert.deepEqual(tight, loose);

  const sized = new Pdf.SizedBox({ width: 200, child: wordsTable() })
    .layout(context(), { maxWidth: 500, maxHeight: 500 });
  assert.deepEqual(sized.data.childBox.data.columnWidths, loose);
});

test('intrinsic Table columns measure their content unbounded, as upstream', () => {
  const ctx = context();
  const atlantica = new Pdf.Text('ATLANTICA').layout(ctx, new Pdf.BoxConstraints()).width;
  const short = new Pdf.Text('bbbbbb').layout(ctx, new Pdf.BoxConstraints()).width;
  // `TableWidth.max` spreads the natural widths over the table in proportion.
  const expected = [atlantica, short].map(width => width / (atlantica + short) * 300);
  const widths = wordsTable('bbbbbb')
    .layout(ctx, new Pdf.BoxConstraints({ minWidth: 300, maxWidth: 300, maxHeight: 500 }))
    .data.columnWidths;
  assert.deepEqual(widths.map(width => width.toFixed(6)), expected.map(width => width.toFixed(6)));
  assert.deepEqual(widths, wordsTable('bbbbbb').layout(ctx, { maxWidth: 300, maxHeight: 500 }).data.columnWidths);
  // Inside an Expanded the table used to get two 150pt columns.
  const expanded = new Pdf.Expanded({ child: wordsTable('bbbbbb') });
  const row = new Pdf.Row({ children: [expanded] }).layout(ctx, { maxWidth: 300, maxHeight: 500 });
  const table = JSON.stringify(row.data, (key, value) => key === 'widget' ? undefined : value);
  assert.match(table, new RegExp(`"columnWidths":\\[${widths.join(',')}\\]`));
});

// ------------------------------------------------ 4. GridAxis angle modulo

test('GridAxis takes a Dart-style non-negative modulo of a negative label angle', () => {
  const direction = angle => new Pdf.FixedAxis([0, 10], { angle }).angleDirection();
  assert.equal(direction(-Math.PI / 4), direction(3 * Math.PI / 4));
  assert.equal(direction(-Math.PI / 4), -1);
  assert.equal(direction(-3 * Math.PI / 4), 1);
  assert.equal(direction(Math.PI / 4), 1);

  const ctx = context();
  const incoming = { axisPosition: 0, crossAxisPosition: 0, marginEnd: 0 };
  const size = { width: 300, height: 200 };
  const layout = angle => new Pdf.FixedAxis([0, 10], { angle, format: value => `label ${value}` })
    .layout(ctx, 'horizontal', size, incoming);
  const negative = layout(-Math.PI / 4);
  const positive = layout(3 * Math.PI / 4);
  assert.equal(negative.crossAxisPosition, positive.crossAxisPosition);
  assert.equal(negative.marginEnd, positive.marginEnd);
});

// --------------------------------------------------------------- 5. SVG

function svgPdf(svg) {
  return render(() => new Pdf.SvgImage({ svg, width: 100, height: 100 }));
}

test('a circular gradient href chain is left unresolved instead of throwing', () => {
  const pdf = svgPdf('<svg viewBox="0 0 10 10"><defs>'
    + '<linearGradient id="a" href="#b"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient>'
    + '<linearGradient id="b" href="#a" x2="0" y2="1"/>'
    + '<radialGradient id="c" href="#c"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></radialGradient>'
    + '</defs><rect width="10" height="5" fill="url(#a)"/><rect y="5" width="10" height="5" fill="url(#c)"/></svg>');
  assert.match(pdf, /\/ShadingType 2/);
  assert.match(pdf, /\/ShadingType 3/);
});

test('a non-numeric SVG number is treated as absent', () => {
  const opaque = svgPdf('<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/></svg>');
  const opacity = svgPdf('<svg viewBox="0 0 10 10"><rect width="10" height="10" opacity="abc" fill="red"/></svg>');
  const strip = pdf => pdf.replace(/\/CreationDate \(D:\d{14}Z\)/, '');
  assert.equal(strip(opacity), strip(opaque));
  assert.doesNotMatch(svgPdf('<svg viewBox="0 0 10 10"><rect width="abc" height="10" fill="red"/></svg>'), / re\s+f/);
  assert.match(svgPdf('<svg viewBox="0 0 10 10" width="auto"><rect width="10" height="10" fill="red"/></svg>'), /1 0 0 rg/);
  // A dash list with a malformed entry is invalid as a whole, so the stroke is solid.
  const dashed = svgPdf('<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="none" stroke="red" stroke-dasharray="5 abc"/></svg>');
  assert.match(dashed, /1 0 0 RG/);
  assert.match(dashed, /\[\] 0 d/);
  assert.match(svgPdf('<svg viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="x" stop-color="red" stop-opacity="?"/>'
    + '<stop offset="1" stop-color="blue"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/></svg>'), /\/ShadingType 2/);
});

// ------------------------------------------ 6. translucent shades and stops

const half = (r, g, b) => new Pdf.PdfColor(r, g, b, 0.5);

test('the default progress track keeps the alpha of a translucent value colour', () => {
  const build = () => new Pdf.SizedBox({
    width: 100,
    child: new Pdf.LinearProgressIndicator({ value: 0.5, valueColor: half(0, 0, 1) })
  });
  const pdf = render(build);
  const ops = pageStreams(pdf)[0].split(/\s+/);
  // The track is painted first, and already under the colour's 0.5 alpha.
  assert.equal(ops.filter(op => op === 'f').length, 2);
  assert.equal(ops.filter(op => op === 'gs').length, 1);
  assert.ok(ops.indexOf('gs') < ops.indexOf('f'), ops.join(' '));
  assert.match(pdf, /\/ca 0\.5/);
  assert.doesNotMatch(render(build, { colorAlpha: false }), /ExtGState/);
});

test('a one-colour gradient is a flat fill that keeps its alpha, as upstream PR #1980', () => {
  const build = () => new Pdf.Container({
    width: 40,
    height: 40,
    decoration: { gradient: new Pdf.LinearGradient({ colors: [half(1, 0, 0)] }) }
  });
  const pdf = render(build);
  assert.doesNotMatch(pdf, /\/ShadingType/);
  assert.match(pdf, /\/ca 0\.5/);
  assert.match(pageStreams(pdf)[0], /1 0 0 rg[\s\S]*re\s+f/);
  const flat = render(build, { colorAlpha: false });
  assert.doesNotMatch(flat, /ExtGState|ShadingType/);
});
