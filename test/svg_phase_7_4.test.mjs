/*
 * js_pdf tests — phase 7.4 SVG fixes: crashes, viewports, text runs and paint.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Tests may use Node APIs; src/ may not (enforced by tools/check-source.mjs).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import * as Pdf from '../src/index.ts';
import { PdfCanvas } from '../src/pdf/graphics.ts';
import { PdfType1Font } from '../src/pdf/font/type1_fonts.ts';
import { formatNumber } from '../src/pdf/format/num.ts';
import { SvgColor } from '../src/svg/color.ts';
import { SvgGradient } from '../src/svg/gradient.ts';
import { viewBoxTransform } from '../src/svg/group.ts';
import { SvgPainter } from '../src/svg/painter.ts';
import { SvgParser, convertStyle } from '../src/svg/parser.ts';
import { SvgTransform } from '../src/svg/transform.ts';
import { parseXml } from '../src/svg/xml.ts';

const parserFor = markup => SvgParser.fromXml({ xml: parseXml(markup) });
const bareParser = parserFor('<svg/>');

const paint = markup => {
  const parser = parserFor(markup);
  const canvas = new PdfCanvas(200);
  new SvgPainter(parser, canvas, parser.viewBox).paint();
  return { canvas, output: canvas.output().trim().split('\n') };
};

const states = canvas => [...canvas.graphicStates.values()];
const fillAlphas = canvas => states(canvas).filter(d => d.has('/ca')).map(d => d.get('/ca').value);
const softMasks = canvas => states(canvas).filter(d => d.has('/SMask')).map(d => d.get('/SMask').mask);
const maskText = mask => Buffer.from(mask.content).toString('latin1');
const textRuns = output => output
  .filter(line => line.startsWith('BT '))
  .map(line => {
    const match = / (-?[\d.]+) (-?[\d.]+) Tm \((.*)\) Tj ET$/.exec(line);
    return { x: Number(match[1]), y: Number(match[2]), text: match[3] };
  });
const helvetica = PdfType1Font.helvetica();
const advance = (text, size) => helvetica.stringMetrics(text, size).advanceWidth;
const close = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-3, `${message ?? ''} expected ${expected}, got ${actual}`);

// ---------------------------------------------------------------- L43

test('L43 a <use> referencing its own ancestor paints nothing instead of overflowing', () => {
  const { output } = paint(
    '<svg viewBox="0 0 100 100"><g id="a"><rect width="1" height="1"/><use href="#a"/></g></svg>'
  );
  assert.equal(output.filter(line => line === '0 0 m').length, 1, 'the rect is drawn exactly once');
});

test('L43 mutually recursive <use> references stop at the cycle, siblings still paint', () => {
  const { output } = paint(`<svg viewBox="0 0 100 100"><defs>
    <g id="a"><use href="#b"/><rect width="2" height="2"/></g>
    <g id="b"><use href="#a"/></g>
  </defs><use href="#a"/><use href="#"/><use href="other.svg#a"/><rect x="5" width="1" height="1"/></svg>`);
  assert.equal(output.filter(line => line === '0 0 m').length, 1);
  assert.ok(output.includes('5 0 m'));
});

// ---------------------------------------------------------------- L45

test('L45 an undecodable <image> is skipped and the rest of the drawing paints', () => {
  for (const href of [
    'pic.png',
    'data:image/png;base64,!!!',
    'data:image/svg+xml;base64,PHN2Zy8+',
    'data:image/svg+xml;utf8,%3Csvg/%3E',
    'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
    'data:image/webp;base64,UklGRhoAAABXRUJQVlA4',
    'data:image/jpeg;base64,/9j/'
  ]) {
    const { output } = paint(`<svg viewBox="0 0 10 10">
      <image href="${href}" width="5" height="5"/><rect x="3" width="1" height="1"/></svg>`);
    assert.ok(output.includes('3 0 m'), href);
    assert.ok(!output.some(line => / Do$/.test(line)), href);
  }
});

// ---------------------------------------------------------------- L32

test('L32 a transform function with the wrong arguments is skipped, not fatal', () => {
  const identity = [1, 0, 0, 1, 0, 0];
  for (const value of [
    'translate(a,b)', 'matrix(1,0)', 'matrix(1,0,0,1,0,0,7)', 'rotate()', 'rotate(45, 1)',
    'scale()', 'skewX(1,2)', 'translate(1,2,3)', 'translate(1px)'
  ]) {
    assert.deepEqual(SvgTransform.fromString(value).matrix, identity, value);
  }
  assert.deepEqual(SvgTransform.fromString('translate(10,10) scale()').matrix, [1, 0, 0, 1, 10, 10]);
  assert.deepEqual(SvgTransform.fromString('translate(10-5)').matrix, [1, 0, 0, 1, 10, -5]);
  assert.deepEqual(SvgTransform.fromString('scale(.5.5)').matrix, [0.5, 0, 0, 0.5, 0, 0]);

  const { output } = paint(`<svg viewBox="0 0 10 10">
    <linearGradient id="g" gradientTransform="matrix(1,2)"><stop stop-color="red"/></linearGradient>
    <path d="M0 0L5 5" stroke="red" transform="translate(a,b)"/>
    <rect width="5" height="5" fill="url(#g)" transform="matrix(1,0)"/></svg>`);
  assert.ok(!output.includes('1 0 0 0 0 0 cm'), 'no singular matrix reaches the stream');
  assert.ok(output.includes('S'));
});

// ---------------------------------------------------------------- L166

test('L166 an unparsable functional colour is invalid paint, for fills and stops', () => {
  for (const value of ['rgb(a,b,c)', 'rgb(1em,0,0)', 'rgb(none)', 'rgba(1,2)', 'hsl(x,y,z)', 'hsla(1em,0,0)']) {
    const color = SvgColor.fromXml(value, bareParser);
    assert.equal(color.isEmpty, true, value);
    const { output } = paint(`<svg viewBox="0 0 10 10"><rect width="1" height="1" fill="${value}"/></svg>`);
    assert.ok(!output.includes('f'), value);
  }

  const parser = parserFor(`<svg viewBox="0 0 10 10"><linearGradient id="g">
    <stop offset="0" stop-color="red"/><stop offset="1" stop-color="rgb(a,b,c)"/>
  </linearGradient></svg>`);
  assert.deepEqual(SvgGradient.fromReference('url(#g)', parser).colors, [[1, 0, 0], [0, 0, 0]]);
});

// ---------------------------------------------------------------- L33

test('L33 an unresolved mask is ignored rather than aborting the drawing', () => {
  const { canvas, output } = paint(
    '<svg viewBox="0 0 100 100"><rect width="10" height="10" mask="url(#nope)"/><rect x="3" width="1" height="1" mask="url(#r)"/><rect id="r"/></svg>'
  );
  assert.ok(output.includes('f'));
  assert.ok(output.includes('3 0 m'));
  assert.equal(softMasks(canvas).length, 0);
});

test('L33 the soft mask is set in the masked element\'s own user space', () => {
  const { canvas, output } = paint(`<svg viewBox="0 0 100 100">
    <mask id="m"><rect width="100" height="100" fill="white"/></mask>
    <rect width="10" height="10" transform="translate(50,0)" mask="url(#m)"/></svg>`);
  const cm = output.indexOf('1 0 0 1 50 0 cm');
  const gs = output.findIndex(line => /^\/g\d+ gs$/.test(line));
  assert.ok(cm >= 0 && gs > cm, 'the element transform precedes the SMask');

  // The /BBox is the painter's box mapped back through the element transform,
  // so nothing that is visible on the page is cut.
  const [mask] = softMasks(canvas);
  assert.deepEqual(mask.boundingBox, { x: -50, y: 0, width: 100, height: 100 });
});

test('L33 a stroke reaching beyond the geometry is not cut by the mask /BBox', () => {
  const { canvas } = paint(`<svg viewBox="0 0 100 100">
    <mask id="m"><rect width="100" height="100" fill="white"/></mask>
    <rect x="10" y="10" width="10" height="10" stroke="red" stroke-width="8" mask="url(#m)"/></svg>`);
  const [box] = softMasks(canvas).map(mask => mask.boundingBox);
  assert.ok(box.x <= 6 && box.y <= 6 && box.x + box.width >= 24 && box.y + box.height >= 24);
});

test('mask content inherits from the mask\'s own ancestors, not the masked element', () => {
  const { canvas } = paint(`<svg viewBox="0 0 10 10" fill="lime">
    <mask id="m"><rect width="10" height="10"/></mask>
    <rect width="10" height="10" fill="red" mask="url(#m)"/></svg>`);
  const content = maskText(softMasks(canvas)[0]);
  assert.match(content, /0 1 0 rg/);
  assert.doesNotMatch(content, /1 0 0 rg/);
});

// ---------------------------------------------------------------- L36

test('L36 display and visibility in a style attribute hide the element', () => {
  for (const markup of [
    '<svg viewBox="0 0 10 10"><g style="display:none"><rect width="6" height="4"/></g></svg>',
    '<svg viewBox="0 0 10 10"><rect style="visibility: hidden" width="6" height="4"/></svg>',
    '<svg viewBox="0 0 10 10" display="none"><rect width="6" height="4"/></svg>',
    '<svg viewBox="0 0 10 10" style="display:none"><rect width="6" height="4"/></svg>'
  ]) {
    assert.ok(!paint(markup).output.includes('f'), markup);
  }
});

// ---------------------------------------------------------------- L41

test('L41 a percentage root size is treated as unset, so SvgImage sizes from the box', () => {
  const parser = parserFor('<svg width="100%" height="50%" viewBox="0 0 24 12"/>');
  assert.equal(parser.width, null);
  assert.equal(parser.height, null);

  const document = new Pdf.Document();
  const context = { document, canvas: new PdfCanvas(300), pageFormat: { width: 200, height: 300 }, pageNumber: 1, theme: document.theme };
  const box = new Pdf.SvgImage({ svg: '<svg width="100%" height="100%" viewBox="0 0 24 12"/>' })
    .layout(context, { maxWidth: 200, maxHeight: 300 });
  assert.deepEqual([box.width, box.height], [200, 100]);
});

test('L41 percentage lengths resolve against the nearest viewport', () => {
  const { output } = paint(`<svg viewBox="0 0 24 12">
    <rect width="50%" height="25%"/>
    <path d="M0 0L5 5" stroke="red" stroke-width="10%"/></svg>`);
  assert.ok(output.includes('12 0 l'));
  assert.ok(output.includes('12 3 l'));
  // sqrt((24^2 + 12^2) / 2) * 10%
  assert.ok(output.includes(`${formatNumber(Math.sqrt((24 * 24 + 12 * 12) / 2) / 10)} w`));

  const nested = paint(`<svg viewBox="0 0 100 100"><svg width="50" height="20">
    <rect x="10%" width="50%" height="50%"/></svg></svg>`).output;
  assert.ok(nested.includes('5 0 m'));
  assert.ok(nested.includes('30 0 l'));
  assert.ok(nested.includes('30 10 l'));
});

// ---------------------------------------------------------------- L38 L39 L40

test('L38 a nested <svg> clips to its viewport and fits its viewBox into it', () => {
  const { output } = paint(`<svg viewBox="0 0 100 100"><svg x="10" y="10" width="20" height="20"
    viewBox="0 0 100 100"><rect width="100" height="100" fill="red"/></svg></svg>`);
  const clip = output.indexOf('10 10 20 20 re');
  assert.ok(clip >= 0);
  assert.equal(output[clip + 1], 'W n');
  assert.equal(output[clip + 2], '0.2 0 0 0.2 10 10 cm');

  const empty = paint(`<svg viewBox="0 0 100 100"><svg width="0" height="20">
    <rect width="100" height="100"/></svg></svg>`).output;
  assert.ok(!empty.includes('f'), 'a zero-sized viewport renders nothing');
});

test('L39 <use> sizes a <symbol> viewport and fits the symbol viewBox', () => {
  const { output } = paint(`<svg viewBox="0 0 100 100">
    <symbol id="s" viewBox="0 0 100 100"><rect width="100" height="100" fill="red"/></symbol>
    <use href="#s" x="5" y="5" width="24" height="24"/></svg>`);
  const translate = output.indexOf('1 0 0 1 5 5 cm');
  const clip = output.indexOf('0 0 24 24 re');
  assert.ok(translate >= 0 && clip > translate);
  assert.equal(output[clip + 1], 'W n');
  assert.equal(output[clip + 2], '0.24 0 0 0.24 0 0 cm');

  const svgTarget = paint(`<svg viewBox="0 0 100 100"><defs>
    <svg id="v" viewBox="0 0 10 10" width="100" height="100"><rect width="10" height="10"/></svg>
  </defs><use href="#v" width="20" height="20"/></svg>`).output;
  assert.ok(svgTarget.includes('0 0 20 20 re'));
  assert.ok(svgTarget.includes('2 0 0 2 0 0 cm'));

  const symbolAlone = paint(`<svg viewBox="0 0 100 100">
    <symbol id="s"><rect width="10" height="10"/></symbol></svg>`).output;
  assert.ok(!symbolAlone.includes('f'), 'a symbol is drawn only through <use>');
});

test('L40 preserveAspectRatio: none, meet, slice and all nine alignments', () => {
  const wide = { x: 0, y: 0, width: 20, height: 10 };
  const tall = { x: 0, y: 0, width: 10, height: 20 };
  const square = { x: 0, y: 0, width: 10, height: 10 };
  const fractions = { Min: 0, Mid: 0.5, Max: 1 };

  assert.deepEqual(viewBoxTransform(wide, square, null), [1, 0, 0, 1, 5, 0]);
  assert.deepEqual(viewBoxTransform(wide, square, 'foo bar'), [1, 0, 0, 1, 5, 0]);
  assert.deepEqual(viewBoxTransform(wide, square, 'none'), [2, 0, 0, 1, 0, 0]);
  assert.deepEqual(viewBoxTransform(wide, square, 'defer xMaxYMid'), [1, 0, 0, 1, 10, 0]);
  assert.deepEqual(viewBoxTransform(wide, null, null), [1, 0, 0, 1, 0, 0]);
  assert.deepEqual(
    viewBoxTransform({ x: 1, y: 2, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 }, null),
    [1, 0, 0, 1, -4, -3]
  );

  for (const [xName, fx] of Object.entries(fractions)) {
    for (const [yName, fy] of Object.entries(fractions)) {
      const align = `x${xName}Y${yName}`;
      assert.deepEqual(viewBoxTransform(wide, square, align), [1, 0, 0, 1, 10 * fx, 0], `${align} meet`);
      assert.deepEqual(viewBoxTransform(wide, square, `${align} slice`), [2, 0, 0, 2, 0, 0 - 10 * fy], `${align} slice`);
      assert.deepEqual(viewBoxTransform(tall, square, `${align} meet`), [1, 0, 0, 1, 0, 10 * fy], `${align} tall`);
    }
  }

  const { output } = paint(`<svg viewBox="0 0 100 100">
    <symbol id="s" viewBox="0 0 10 10" preserveAspectRatio="xMinYMax slice"><rect width="10" height="10"/></symbol>
    <use href="#s" width="20" height="10"/></svg>`);
  assert.ok(output.includes('2 0 0 2 0 -10 cm'));
});

// ---------------------------------------------------------------- L28

test('L28 tspan runs are drawn in document order, advancing one pen', () => {
  const runs = textRuns(paint(
    '<svg viewBox="0 0 300 30"><text x="5" y="20" font-size="12">AB<tspan>CD</tspan>EF</text></svg>'
  ).output);
  assert.deepEqual(runs.map(run => run.text), ['AB', 'CD', 'EF']);
  close(runs[0].x, 5);
  close(runs[1].x, 5 + advance('AB', 12));
  close(runs[2].x, 5 + advance('AB', 12) + advance('CD', 12));
  assert.ok(runs.every(run => run.y === 20));
});

test('L28 white space collapses unless xml:space="preserve" applies', () => {
  const joined = markup => textRuns(paint(`<svg viewBox="0 0 300 30">${markup}</svg>`).output)
    .map(run => run.text).join('');
  assert.equal(joined('<text x="5" y="20">  A\n\t  B  </text>'), 'A B');
  assert.equal(joined('<text> <tspan>A</tspan> <tspan> B</tspan> </text>'), 'A B');
  assert.equal(joined('<text>Hi<title>T</title><desc>D</desc></text>'), 'Hi');
  assert.equal(joined('<text xml:space="preserve">A  B</text>'), 'A  B');
  assert.equal(joined('<g xml:space="preserve"><text>A\n B</text></g>'), 'A  B');
  assert.equal(joined('<g xml:space="preserve"><text xml:space="default">A  B</text></g>'), 'A B');
});

test('L28 text-anchor shifts a whole chunk by its advance width', () => {
  const runs = textRuns(paint(`<svg viewBox="0 0 100 100"><text x="50" y="20"
    text-anchor="middle" font-size="10">AB<tspan>CD</tspan></text></svg>`).output);
  const width = advance('AB', 10) + advance('CD', 10);
  close(runs[0].x, 50 - width / 2);
  close(runs[1].x, 50 - width / 2 + advance('AB', 10));

  const chunks = textRuns(paint(`<svg viewBox="0 0 200 100"><text x="10" y="20"
    text-anchor="end" font-size="10">AB<tspan x="100" dx="5">CD</tspan></text></svg>`).output);
  close(chunks[0].x, 10 - advance('AB', 10), 'first chunk');
  close(chunks[1].x, 105 - advance('CD', 10), 'an absolute x starts a new chunk');
});

// ---------------------------------------------------------------- L31

test('L31 stroke-width of zero or less does not stroke', () => {
  for (const width of ['0', '-1']) {
    const path = paint(`<svg viewBox="0 0 10 10"><path d="M0 0L5 5" fill="none" stroke="red"
      stroke-width="${width}"/></svg>`).output;
    assert.ok(!path.includes('S') && !path.includes('1 0 0 RG'), width);
    const text = paint(`<svg viewBox="0 0 10 10"><text stroke="red" stroke-width="${width}"
      fill="none">A</text></svg>`).output;
    assert.ok(!text.some(line => / 1 Tr /.test(line)), width);
  }
});

// ---------------------------------------------------------------- L167

test('L167 colour alpha folds into fill and stroke opacity, with an opaque colour', () => {
  const transparent = SvgColor.fromXml('transparent', bareParser);
  assert.equal(transparent.opacity, 0);
  const hidden = paint('<svg viewBox="0 0 10 10"><rect width="1" height="1" fill="transparent"/></svg>').output;
  assert.ok(!hidden.includes('f') && !hidden.includes('1 1 1 rg'), 'transparent paints nothing');

  for (const [value, rgb, alpha] of [
    ['#ff000080', [1, 0, 0], 128 / 255],
    ['#F008', [1, 0, 0], 0x88 / 255],
    ['hsla(0, 100%, 50%, 0.5)', [1, 0, 0], 0.5],
    ['hsla(0 100% 50% / 25%)', [1, 0, 0], 0.25],
    ['rgba(255, 0, 0, 50%)', [1, 0, 0], 0.5]
  ]) {
    const color = SvgColor.fromXml(value, bareParser);
    assert.deepEqual(color.color, rgb, value);
    close(color.opacity, alpha, value);

    const { canvas, output } = paint(`<svg viewBox="0 0 10 10"><rect width="1" height="1" fill="${value}"/></svg>`);
    assert.ok(output.includes('1 0 0 rg'), value);
    assert.deepEqual(fillAlphas(canvas).map(formatNumber), [formatNumber(alpha)], value);
  }

  const { canvas, output } = paint(
    '<svg viewBox="0 0 10 10"><text fill="rgba(255,0,0,0.5)" fill-opacity="0.5">A</text></svg>'
  );
  assert.ok(output.includes('1 0 0 rg'));
  assert.deepEqual(fillAlphas(canvas), [0.25]);
});

// ---------------------------------------------------------------- L164 L163

test('L164 a paint server url resolves first, then its fallback colour', () => {
  const gradient = '<linearGradient id="g"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient>';
  for (const value of ['url(#g) #00ff00', "url('#g')", 'url("#g") none', 'url( #g )']) {
    const { output } = paint(`<svg viewBox="0 0 10 10">${gradient}<rect width="1" height="1" fill="${value.replace(/"/g, '&quot;')}"/></svg>`);
    assert.ok(output.includes('/Pattern cs /p1 scn'), value);
  }
  const fallback = paint('<svg viewBox="0 0 10 10"><rect width="1" height="1" fill="url(#nope) #00ff00"/></svg>').output;
  assert.ok(fallback.includes('0 1 0 rg'));
  const missing = paint('<svg viewBox="0 0 10 10"><rect width="1" height="1" fill="url(#nope)"/></svg>').output;
  assert.ok(!missing.includes('f'));
});

test('L163 stop-color: currentColor resolves against the inherited color', () => {
  const parser = parserFor(`<svg color="#00ff00"><defs color="blue"><linearGradient id="g">
    <stop stop-color="currentColor"/><stop offset="1" style="color:red;stop-color:currentColor"/>
  </linearGradient></defs><linearGradient id="h"><stop stop-color="currentColor"/></linearGradient></svg>`);
  assert.deepEqual(SvgGradient.fromReference('url(#g)', parser).colors, [[0, 0, 1], [1, 0, 0]]);
  assert.deepEqual(SvgGradient.fromReference('url(#h)', parser).colors, [[0, 1, 0]]);
});

// ---------------------------------------------------------------- L30 L37

test('L30 miter-clip and arcs joins fall back to a miter join', () => {
  for (const join of ['miter-clip', 'arcs', ' miter ']) {
    const { output } = paint(`<svg viewBox="0 0 10 10"><g stroke-linejoin="round">
      <path d="M0 0L5 5" stroke="red" stroke-linejoin="${join}"/></g></svg>`);
    assert.ok(output.includes('0 j'), join);
  }
});

test('L37 convertStyle splits only on semicolons outside quotes and parentheses', () => {
  const element = parseXml(`<text style="font-family:'A;B';fill:#0f0;stroke;-x-y:1;filter:url(data:a;b)"/>`).rootElement;
  convertStyle(element);
  assert.equal(element.getAttribute('font-family'), "'A;B'");
  assert.equal(element.getAttribute('fill'), '#0f0');
  assert.equal(element.getAttribute('filter'), 'url(data:a;b)');
});

// ---------------------------------------------------------------- extras

test('hsl hue is in degrees out of 360', () => {
  const round = rgb => rgb.map(v => Math.round(v * 1000) / 1000);
  assert.deepEqual(round(SvgColor.fromXml('hsl(120, 100%, 50%)', bareParser).color), [0, 1, 0]);
  assert.deepEqual(round(SvgColor.fromXml('hsl(240deg 100% 50%)', bareParser).color), [0, 0, 1]);
});

test('a clip-path is applied in the element\'s user space, after its transform', () => {
  const { output } = paint(`<svg viewBox="0 0 100 100"><clipPath id="c"><rect width="10" height="10"/></clipPath>
    <rect width="10" height="10" transform="translate(50,0)" clip-path="url(#c)"/></svg>`);
  const cm = output.indexOf('1 0 0 1 50 0 cm');
  const clip = output.indexOf('W n');
  assert.ok(cm >= 0 && clip > cm);
});
