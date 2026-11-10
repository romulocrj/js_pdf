/*
 * js_pdf PR 15 review regression tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Pdf from '../src/index.ts';
import { generateReviewPr15 } from '../examples/review-pr15.mjs';
import { latin1 } from './support/pdf-text.mjs';
import { PdfCanvas } from '../src/pdf/graphics.ts';
import { PdfShadingPattern } from '../src/pdf/obj/pattern.ts';
import { SvgParser } from '../src/svg/parser.ts';
import { SvgPainter } from '../src/svg/painter.ts';
import { parseXml } from '../src/svg/xml.ts';

function context(textDirection = 'ltr', canvas = new PdfCanvas(200)) {
  const document = new Pdf.Document();
  return { document, canvas, textDirection, theme: document.theme,
    pageFormat: { width: 200, height: 200 }, pageNumber: 1 };
}

/** Follow q/Q and gs to observe the actual fill/stroke alpha at each paint. */
function paintedAlphas(canvas) {
  const tokens = canvas.output().match(/\((?:\\.|[^\\)])*\)|<[^>]*>|\/\w+|\S+/g) ?? [];
  const stack = [];
  const paints = [];
  let fill = 1, stroke = 1;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === 'q') stack.push([fill, stroke]);
    else if (token === 'Q') [fill, stroke] = stack.pop();
    else if (token === 'gs') {
      const state = canvas.graphicStates.get(tokens[index - 1]);
      fill = state.get('/ca')?.value ?? fill;
      stroke = state.get('/CA')?.value ?? stroke;
    } else if (['f', 'S', 'Do', 'sh', 'Tj', 'scn', 'SCN'].includes(token)) {
      paints.push({ operator: token, fill, stroke });
    }
  }
  assert.equal(stack.length, 0, 'graphics scopes balance');
  return paints;
}

const shading = () => new Pdf.PdfShading({ type: 'axial',
  fn: Pdf.PdfBaseFunction.colorsAndStops([[1, 0, 0], [0, 0, 1]], []),
  start: { x: 0, y: 0 }, end: { x: 20, y: 0 } });
const image = () => new Pdf.PdfImage({ pixels: new Uint8Array([255, 0, 0, 255]), width: 1, height: 1, hasAlpha: true });

test('a transparent background cannot hide the following image or gradient', () => {
  const ctx = context();
  const widget = new Pdf.Column({ mainAxisSize: 'min', children: [
    new Pdf.Container({ width: 20, height: 10, color: new Pdf.PdfColor(1, 0, 0, 0) }),
    new Pdf.Image(new Pdf.RawImage({ bytes: new Uint8Array([255, 0, 0, 255]), width: 1, height: 1 }), { width: 20, height: 20 }),
    new Pdf.Container({ width: 20, height: 10, decoration: new Pdf.BoxDecoration({
      gradient: new Pdf.LinearGradient({ colors: ['#00ff00', '#0000ff'] }) }) })
  ] });
  const box = widget.layout(ctx, { maxWidth: 200, maxHeight: 200 });
  widget.paint(ctx, { ...box, x: 0, y: 0 });
  const paints = paintedAlphas(ctx.canvas);
  assert.deepEqual(paints.filter(p => p.operator === 'Do').map(p => p.fill), [1]);
  assert.deepEqual(paints.filter(p => p.operator === 'f').map(p => p.fill), [0, 1]);
});

test('patterns use enclosing opacity instead of the previous solid colour alpha', () => {
  const canvas = new PdfCanvas(200);
  canvas.setGraphicState(new Pdf.PdfGraphicState({ fillOpacity: 0.4, strokeOpacity: 0.6 }));
  canvas.setColor(new Pdf.PdfColor(1, 0, 0, 0.25));
  const pattern = new PdfShadingPattern({ shading: shading() });
  canvas.setFillPattern(pattern);
  canvas.fillPath();
  canvas.setStrokePattern(pattern);
  canvas.strokePath();
  const paints = paintedAlphas(canvas);
  assert.equal(paints.find(p => p.operator === 'f').fill, 0.4);
  assert.equal(paints.find(p => p.operator === 'S').stroke, 0.6);
});

test('images, forms and direct shadings keep enclosing opacity and restore colour alpha', () => {
  for (const kind of ['image', 'form', 'shading']) {
    const canvas = new PdfCanvas(200);
    canvas.setGraphicState(new Pdf.PdfGraphicState({ fillOpacity: 0.4, strokeOpacity: 0.6 }));
    canvas.setColor(new Pdf.PdfColor(1, 0, 0, 0.25));
    if (kind === 'image') canvas.drawImage(image(), 0, 0, 20, 20);
    if (kind === 'form') canvas.drawForm(new Pdf.PdfFormXObject({ width: 20, height: 20, paint: c => {
      c.setColor('#0000ff'); c.drawRect(0, 0, 20, 20); c.fillAndStrokePath();
    } }), 0, 0);
    if (kind === 'shading') canvas.drawShading(shading());
    canvas.fillPath();
    canvas.strokePath();
    const paints = paintedAlphas(canvas);
    const placed = paints.find(p => p.operator === 'Do' || p.operator === 'sh');
    assert.equal(placed.fill, 0.4, kind);
    if (kind === 'form') assert.equal(placed.stroke, 0.6, kind);
    assert.equal(paints.at(-2).fill, 0.1, `${kind} restores the selected fill alpha`);
    assert.equal(paints.at(-1).stroke, 0.15, `${kind} restores the selected stroke alpha`);
  }
});

test('nested tspan opacity composes once with text, group and paint opacity', () => {
  const parser = SvgParser.fromXml({ xml: parseXml(`<svg viewBox="0 0 200 100"><g opacity="0.5">
    <text opacity="0.5" fill="red" fill-opacity="0.5" stroke="blue" stroke-opacity="0.25">A<tspan opacity="0.5">B<tspan opacity="0.5">C</tspan>D</tspan>E<tspan opacity="0">HIDDEN</tspan>F</text>
  </g></svg>`) });
  const canvas = new PdfCanvas(100);
  new SvgPainter(parser, canvas, parser.viewBox).paint();
  assert.doesNotMatch(canvas.output(), /HIDDEN/);
  const painted = paintedAlphas(canvas).filter(p => p.operator === 'Tj');
  const factors = [1, 0.5, 0.25, 0.5, 1, 1];
  assert.deepEqual(painted.filter((_, i) => i % 2 === 0).map(p => p.fill), factors.map(f => f * 0.125));
  assert.deepEqual(painted.filter((_, i) => i % 2 === 1).map(p => p.stroke), factors.map(f => f * 0.0625));
});

test('Text and RichText directional margins reserve width, wrap and paint on the resolved side', () => {
  for (const Kind of [Pdf.Text, Pdf.RichText]) {
    const build = margin => Kind === Pdf.Text
      ? new Pdf.Text('AA BB', { font: Pdf.PdfType1Font.courier(), fontSize: 10, margin })
      : new Pdf.RichText({ margin, text: new Pdf.TextSpan({ text: 'AA BB',
        style: new Pdf.TextStyle({ font: Pdf.Font.courier(), fontSize: 10 }) }) });
    const widget = build(Pdf.EdgeInsetsDirectional.only({ start: 20, end: 5, top: 3, bottom: 4 }));
    for (const direction of ['ltr', 'rtl', 'ltr']) {
      const ctx = context(direction);
      const physical = build({ left: direction === 'rtl' ? 5 : 20, right: direction === 'rtl' ? 20 : 5, top: 3, bottom: 4 });
      const constraints = { maxWidth: 50, maxHeight: 200 };
      const box = widget.layout(ctx, constraints);
      const reference = physical.layout(ctx, constraints);
      assert.equal(box.width, reference.width);
      assert.equal(box.height, reference.height);
      assert.equal(box.data.lines.length, 2, 'margin reduces the text wrapping width');
      assert.equal(box.data.contentWidth, reference.data.contentWidth);
      const referenceContext = context(direction);
      widget.paint(ctx, { ...box, x: 7, y: 11 });
      physical.paint(referenceContext, { ...reference, x: 7, y: 11 });
      assert.equal(ctx.canvas.output(), referenceContext.canvas.output(), `${Kind.name} ${direction}`);
      const fragment = widget.layoutSpan(ctx, { maxWidth: 50, maxHeight: 17 }, widget.initialSpanState());
      const expected = physical.layoutSpan(ctx, { maxWidth: 50, maxHeight: 17 }, physical.initialSpanState());
      assert.equal(fragment.box.width, expected.box.width);
      assert.equal(fragment.box.height, expected.box.height);
      assert.deepEqual(fragment.nextState, expected.nextState);
      assert.equal(fragment.hasMore, true);
    }
  }
});

test('Row and paginated Column resolve directional margins without storing layout state', () => {
  for (const Kind of [Pdf.Row, Pdf.Column]) {
    const build = margin => new Kind({ margin, mainAxisSize: 'min', crossAxisAlignment: 'start',
      children: [new Pdf.SizedBox({ width: 10, height: 10 }), new Pdf.SizedBox({ width: 15, height: 10 })] });
    const widget = build(Pdf.EdgeInsetsDirectional.only({ start: 30, end: 5, top: 2, bottom: 3 }));
    for (const direction of ['ltr', 'rtl', 'ltr']) {
      const ctx = context(direction);
      const physical = build({ left: direction === 'rtl' ? 5 : 30, right: direction === 'rtl' ? 30 : 5, top: 2, bottom: 3 });
      const constraints = { maxWidth: 100, maxHeight: 100 };
      const box = widget.layout(ctx, constraints);
      const reference = physical.layout(ctx, constraints);
      assert.equal(box.width, reference.width, `${Kind.name} ${direction}`);
      assert.equal(box.height, reference.height);
      assert.deepEqual(box.data.children.map(c => [c.dx, c.dy]), reference.data.children.map(c => [c.dx, c.dy]));
      if (Kind === Pdf.Column) {
        const fragment = widget.layoutSpan(ctx, { maxWidth: 100, maxHeight: 15 }, widget.initialSpanState());
        const expected = physical.layoutSpan(ctx, { maxWidth: 100, maxHeight: 15 }, physical.initialSpanState());
        assert.equal(fragment.box.width, expected.box.width);
        assert.equal(fragment.hasMore, true);
        assert.deepEqual(fragment.box.data.children.map(c => [c.dx, c.dy]), expected.box.data.children.map(c => [c.dx, c.dy]));
      }
    }
  }
});

test('the review proof matches source and bundled APIs and is in both example catalogs', () => {
  const normalize = bytes => Buffer.from(bytes).toString('latin1').replace(/\/CreationDate \(D:\d{14}Z\)/, '');
  assert.equal(normalize(generateReviewPr15()), normalize(generateReviewPr15(Pdf)));
  const pdf = latin1(generateReviewPr15(Pdf, false));
  assert.match(pdf, /\/Title \(PR 15 review regressions\)/);
  assert.equal((pdf.match(/\/Type \/Page\b/g) ?? []).length, 1);
  assert.doesNotMatch(pdf, /Tm \(HIDDEN\) Tj/);
  for (const file of ['Browser.html', 'run-phase-examples.mjs']) {
    const catalog = readFileSync(new URL('../examples/' + file, import.meta.url), 'utf8');
    assert.ok(catalog.includes("from './review-pr15.mjs'"), file);
    assert.ok(catalog.includes('generate: () => generateReviewPr15()') || catalog.includes("['review-pr15', () => generateReviewPr15()]"), file);
  }
});
