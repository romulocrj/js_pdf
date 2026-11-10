/*
 * js_pdf tests — phase 7.5 graphics, colours and images fixes.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Colour alpha and opacity composition (L54-L56), isDark/isLight (L57),
 * bezierArc end points (L94) and rotation, Adobe CMYK JPEG inversion (L66)
 * and the RawImage copy. Assertions are on emitted operators and dictionaries.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import * as Pdf from '../src/index.ts';
import { PdfCanvas } from '../src/pdf/graphics.ts';
import { PdfGraphicState } from '../src/pdf/graphic_state.ts';
import { CMYK } from './support/image-dpi-fixtures.mjs';
import { latin1 } from './support/pdf-text.mjs';

const flat = canvas => canvas.output().trim().split('\n').join(' ');
const states = canvas => [...canvas.graphicStates].map(([name, dict]) => `${name} ${dict.toString()}`);
const half = (r, g, b) => new Pdf.PdfColor(r, g, b, 0.5);

function render(build, options = {}) {
  return latin1(Pdf.createPdf({ compress: false, ...options }, () => new Pdf.Page({ margin: 0, build })));
}

// ------------------------------------------------------------- L54 colour alpha

test('L54 a translucent fill colour puts its alpha in force with an ExtGState', () => {
  const canvas = new PdfCanvas(842);
  canvas.setFillColor(half(1, 0, 0));
  canvas.setFillColor(half(0, 0, 1));
  canvas.setFillColor(new Pdf.PdfColor(0, 1, 0));
  // The second colour has the same alpha, so no gs; the opaque one restores 1.
  assert.equal(flat(canvas), '1 0 0 rg /g1 gs 0 0 1 rg 0 1 0 rg /g2 gs');
  assert.deepEqual(states(canvas), ['/g1 << /ca 0.5 >>', '/g2 << /ca 1 >>']);
});

test('L54 a translucent stroke colour writes /CA, and setColor writes both', () => {
  const stroke = new PdfCanvas(842);
  stroke.setStrokeColor(new Pdf.PdfColor(0, 0, 0, 0.25));
  assert.equal(flat(stroke), '0 0 0 RG /g1 gs');
  assert.deepEqual(states(stroke), ['/g1 << /CA 0.25 >>']);

  const both = new PdfCanvas(842);
  both.setColor(new Pdf.PdfColorCmyk(0, 1, 0, 0, 0.5));
  assert.equal(flat(both), '0 1 0 0 k /g1 gs 0 1 0 0 K /g2 gs');
  assert.deepEqual(states(both), ['/g1 << /ca 0.5 >>', '/g2 << /CA 0.5 >>']);
});

test('L54 q/Q scopes the colour alpha in force', () => {
  const canvas = new PdfCanvas(842);
  canvas.saveContext();
  canvas.setFillColor(half(1, 0, 0));
  canvas.restoreContext();
  canvas.setFillColor(new Pdf.PdfColor(0, 0, 0));
  assert.equal(flat(canvas), 'q 1 0 0 rg /g1 gs Q 0 0 0 rg');
});

test('L54 the widget-space helpers paint colour alpha before their operators', () => {
  const canvas = new PdfCanvas(100);
  canvas.fillRect(0, 0, 10, 10, half(1, 0, 0));
  canvas.strokeRect(0, 0, 10, 10, half(0, 0, 1), 2);
  canvas.line(0, 0, 10, 10, new Pdf.PdfColor(0, 0, 0, 0.2));
  canvas.circle(50, 50, 5, { fill: new Pdf.PdfColor(0, 1, 0, 0.2), stroke: new Pdf.PdfColor(0, 0, 0) });
  canvas.text('A', 0, 20, { fontSize: 10, color: new Pdf.PdfColor(0, 0, 0, 0.75) });
  const lines = canvas.output().trim().split('\n');
  assert.deepEqual(lines.slice(0, 8), [
    '/g1 gs', '1 0 0 rg 0 90 10 10 re f',
    '/g2 gs', '0 0 1 RG 2 w 0 90 10 10 re S',
    '/g3 gs', '0 0 0 RG 1 w 0 100 m 10 90 l S',
    // The opaque circle stroke has to undo the line's 0.2 stroke alpha.
    '/g4 gs', '/g5 gs'
  ]);
  assert.match(lines[8], /^0 1 0 rg 0 0 0 RG 1 w .* B$/);
  assert.deepEqual(lines.slice(9), ['/g6 gs', 'BT /F1 10 Tf 0 0 0 rg 1 0 0 1 0 80 Tm (A) Tj ET']);
  assert.deepEqual(states(canvas), [
    '/g1 << /ca 0.5 >>', '/g2 << /CA 0.5 >>', '/g3 << /CA 0.2 >>',
    '/g4 << /ca 0.2 >>', '/g5 << /CA 1 >>', '/g6 << /ca 0.75 >>'
  ]);
});

test('L54 a translucent Container paints translucent, and alpha 0 paints nothing', () => {
  const red = render(() => new Pdf.Container({ width: 50, height: 50, background: Pdf.PdfColor.fromInt(0x80ff0000) }));
  assert.match(red, /\/ExtGState << \/g1 << \/ca 0\.502 >> >>/);
  assert.match(red, /\/g1 gs\n1 0 0 rg 0 791\.89 50 50 re f/);

  const clear = render(() => new Pdf.Container({ width: 50, height: 50, decoration: { color: Pdf.PdfColor.fromInt(0) } }));
  assert.match(clear, /\/ExtGState << \/g1 << \/ca 0 >> >>/);
  assert.match(clear, /\/g1 gs\n0 0 0 rg 0 791\.89 50 50 re f/);
});

test('L54 an opaque document writes no ExtGState', () => {
  const pdf = render(() => new Pdf.Column({ children: [
    new Pdf.Container({ width: 50, height: 20, background: Pdf.PdfColors.red }),
    new Pdf.Container({ width: 50, height: 20, background: '#00ff00' }),
    new Pdf.Text('opaque', { style: new Pdf.TextStyle({ color: new Pdf.PdfColorGrey(0.2) }) })
  ] }));
  assert.doesNotMatch(pdf, /ExtGState| gs\n/);
});

test('L114 a null or undefined colour from plain JS still writes black and never throws', () => {
  const canvas = new PdfCanvas(842);
  canvas.setFillColor(null);
  canvas.setStrokeColor(undefined);
  canvas.setColor(null);
  assert.equal(flat(canvas), '0 0 0 rg 0 0 0 RG 0 0 0 rg 0 0 0 RG');
  assert.equal(canvas.graphicStates.size, 0);
});

// ----------------------------------------------------------- L55 colorAlpha opt-out

test('L55 colorAlpha: false ignores colour alpha on the canvas and the documents', () => {
  const canvas = new PdfCanvas(842, { colorAlpha: false });
  canvas.setFillColor(half(1, 0, 0));
  canvas.fillRect(0, 0, 1, 1, half(1, 0, 0));
  assert.equal(flat(canvas), '1 0 0 rg 1 0 0 rg 0 841 1 1 re f');
  assert.equal(canvas.colorAlpha, false);
  assert.equal(new PdfCanvas(842).colorAlpha, true);

  const document = new Pdf.Document({ colorAlpha: false });
  assert.equal(document.settings.colorAlpha, false);
  assert.equal(new Pdf.Document().settings.colorAlpha, true);

  const build = () => new Pdf.MultiPage({ build: () => [
    new Pdf.Container({ width: 50, height: 50, background: half(1, 0, 0) })
  ] });
  assert.doesNotMatch(render(() => new Pdf.Container({ width: 50, height: 50, background: half(1, 0, 0) }), { colorAlpha: false }), /ExtGState/);
  assert.doesNotMatch(latin1(Pdf.createPdf({ compress: false, colorAlpha: false }, build)), /ExtGState/);
  assert.match(latin1(Pdf.createPdf({ compress: false }, build)), /\/ca 0\.5/);
});

test('L55 colorAlpha: false still lets Opacity paint', () => {
  const pdf = render(() => new Pdf.Opacity({ opacity: 0.5, child: new Pdf.Container({ width: 10, height: 10, background: half(1, 0, 0) }) }),
    { colorAlpha: false });
  assert.match(pdf, /\/ExtGState << \/g1 << \/CA 0\.5 \/ca 0\.5 >> >>/);
  assert.equal((pdf.match(/ gs\n/g) ?? []).length, 1);
});

// ------------------------------------------------------- L56 opacity composition

test('L56 Opacity inside Opacity multiplies, and the inner Q restores the outer alpha', () => {
  const pdf = render(() => new Pdf.Opacity({ opacity: 0.5, child: new Pdf.Column({ children: [
    new Pdf.Opacity({ opacity: 0.5, child: new Pdf.Container({ width: 10, height: 10, background: '#ff0000' }) }),
    new Pdf.Container({ width: 10, height: 10, background: '#0000ff' })
  ] }) }));
  assert.match(pdf, /\/ExtGState << \/g1 << \/CA 0\.5 \/ca 0\.5 >> \/g2 << \/CA 0\.25 \/ca 0\.25 >> >>/);
  assert.match(pdf, /q\n\/g1 gs\nq\n\/g2 gs\n1 0 0 rg [^\n]* re f\nQ\n0 0 1 rg [^\n]* re f\nQ/);
});

test('L56 a translucent colour inside Opacity multiplies with it', () => {
  const pdf = render(() => new Pdf.Opacity({ opacity: 0.5,
    child: new Pdf.Container({ width: 10, height: 10, background: half(1, 0, 0) }) }));
  assert.match(pdf, /\/ExtGState << \/g1 << \/CA 0\.5 \/ca 0\.5 >> \/g2 << \/ca 0\.25 >> >>/);
  assert.match(pdf, /q\n\/g1 gs\n\/g2 gs\n1 0 0 rg [^\n]* re f\nQ/);
});

test('L56 setGraphicState multiplies the alpha a colour or an enclosing state put in force', () => {
  const canvas = new PdfCanvas(842);
  canvas.saveContext();
  canvas.setGraphicState(new PdfGraphicState({ fillOpacity: 0.5, blendMode: 'multiply' }));
  canvas.saveContext();
  canvas.setGraphicState(new PdfGraphicState({ opacity: 0.4 }));
  canvas.setFillColor(half(0, 0, 0));
  canvas.restoreContext();
  canvas.setFillColor(new Pdf.PdfColor(0, 0, 0));
  canvas.restoreContext();
  assert.equal(flat(canvas), 'q /g1 gs q /g2 gs 0 0 0 rg /g3 gs Q 0 0 0 rg Q');
  assert.deepEqual(states(canvas), [
    '/g1 << /ca 0.5 /BM /Multiply >>', '/g2 << /CA 0.4 /ca 0.2 >>', '/g3 << /ca 0.1 >>'
  ]);
});

// ------------------------------------------------------------ L57 isDark/isLight

test('L57 isLight and isDark answer the question their names ask', () => {
  assert.equal(Pdf.PdfColors.white.isLight, true);
  assert.equal(Pdf.PdfColors.white.isDark, false);
  assert.equal(Pdf.PdfColors.black.isDark, true);
  assert.equal(Pdf.PdfColors.black.isLight, false);
  // Upstream's threshold is retained: the cut is near a relative luminance of .337.
  assert.equal(new Pdf.PdfColorGrey(0.62).isLight, true);
  assert.equal(new Pdf.PdfColorGrey(0.6).isDark, true);
});

test('L57 an inside pie legend keeps choosing white on dark slices and black on light ones', () => {
  const pdf = latin1(Pdf.createPdf({ compress: false }, () => new Pdf.Page({ build: () => new Pdf.Chart({
    grid: new Pdf.PieGrid(),
    datasets: [
      new Pdf.PieDataSet({ value: 1, color: Pdf.PdfColors.black, legend: 'dark', legendPosition: 'inside' }),
      new Pdf.PieDataSet({ value: 1, color: Pdf.PdfColors.yellow100, legend: 'light', legendPosition: 'inside' })
    ]
  }) })));
  const texts = pdf.match(/BT [^\n]* Tj ET/g);
  assert.equal(texts.length, 2);
  assert.match(texts[0], / 1 1 1 rg /);
  assert.match(texts[1], / 0 0 0 rg /);
});

// ------------------------------------------------------------------ L94 bezierArc

const curves = canvas => canvas.output().trim().split('\n').filter(line => line.endsWith(' c'))
  .map(line => line.split(' ').slice(0, 6).map(Number));

test('L94 an arc whose radii are too small for the chord still lands on its end point', () => {
  const canvas = new PdfCanvas(842);
  canvas.moveTo(100, 400);
  canvas.bezierArc(100, 400, 10, 10, 200, 400, { sweep: true });
  const last = curves(canvas).at(-1);
  assert.deepEqual(last.slice(4), [200, 400]);
  // The scaled ellipse is the circle on the chord: every curve end is 50 from (150, 400).
  for (const curve of curves(canvas)) assert.ok(Math.abs(Math.hypot(curve[4] - 150, curve[5] - 400) - 50) < 1e-3);
});

test('L94 half circles land on their end point whatever their position', () => {
  let misses = 0;
  for (let index = 0; index < 400; index++) {
    const cx = 37.3 + index * 1.37, cy = 211.9 + index * 0.73, r = 50;
    const angle = (index * 0.0123) % (2 * Math.PI);
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
    const x2 = cx - r * Math.cos(angle), y2 = cy - r * Math.sin(angle);
    const canvas = new PdfCanvas(842);
    canvas.bezierArc(x1, y1, r, r, x2, y2, { sweep: true });
    const last = curves(canvas).at(-1);
    if (Math.hypot(last[4] - x2, last[5] - y2) > 1e-3) misses++;
  }
  assert.equal(misses, 0);
});

test('L94 arcs whose radii already span the chord are byte-identical', () => {
  const arc = (...args) => { const canvas = new PdfCanvas(842); canvas.bezierArc(...args); return flat(canvas); };
  assert.equal(arc(100, 0, 100, 100, 0, 100, { sweep: true }), '100 55.2285 55.2285 100 0 100 c');
  assert.equal(arc(10, 20, 40, 25, 50, 35, { sweep: true }), '27.1008 19.1204 43.1944 25.1555 50 35 c');
  assert.equal(arc(10, 20, 40, 25, 50, 35, { large: true }),
    '-7.3132 20.8905 -21.7275 28.6635 -25.6735 39.237 c -29.6195 49.8104 -22.1951 60.767 -7.299 66.3531 c '
    + '7.5971 71.9391 26.5592 70.8774 39.6295 63.7256 c 52.6998 56.5737 56.8901 44.9668 50 35 c');
});

/** Centre of the SVG arc, per the implementation notes F.6.5 and F.6.6. */
function svgArcCentre(x1, y1, rx, ry, phi, large, sweep, x2, y2) {
  const cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const xp = cos * dx + sin * dy, yp = -sin * dx + cos * dy;
  const lambda = xp * xp / (rx * rx) + yp * yp / (ry * ry);
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  let factor = Math.sqrt(Math.max(0, num / (rx * rx * yp * yp + ry * ry * xp * xp)));
  if (large === sweep) factor = -factor;
  const cxp = factor * rx * yp / ry, cyp = -factor * ry * xp / rx;
  return { cx: cos * cxp - sin * cyp + (x1 + x2) / 2, cy: sin * cxp + cos * cyp + (y1 + y2) / 2, rx, ry };
}

test('bezierArc with an x-axis rotation draws the rotated ellipse between the given points', () => {
  for (const [rx, ry, large] of [[50, 30, false], [120, 60, true], [120, 60, false]]) {
    const phi = 0.3;
    const canvas = new PdfCanvas(842);
    canvas.moveTo(300, 300);
    canvas.bezierArc(300, 300, rx, ry, 400, 300, { sweep: true, large, phi });
    const segments = curves(canvas);
    assert.deepEqual(segments.at(-1).slice(4), [400, 300]);
    const centre = svgArcCentre(300, 300, rx, ry, phi, large, true, 400, 300);
    for (const curve of segments) {
      const dx = curve[4] - centre.cx, dy = curve[5] - centre.cy;
      const u = Math.cos(phi) * dx + Math.sin(phi) * dy, v = -Math.sin(phi) * dx + Math.cos(phi) * dy;
      assert.ok(Math.abs(u * u / centre.rx ** 2 + v * v / centre.ry ** 2 - 1) < 1e-3, `rx ${rx} large ${large}`);
    }
  }
});

test('a 45-degree rotated arc without the sweep flag lands on its end point', () => {
  const canvas = new PdfCanvas(842);
  canvas.moveTo(10, 10);
  canvas.bezierArc(10, 10, 30, 10, 60, 40, { phi: Math.PI / 4, sweep: false });
  assert.deepEqual(curves(canvas).at(-1).slice(4), [60, 40]);
});

// ------------------------------------------------------------- L66 Adobe CMYK JPEG

function segment(marker, payload) {
  const length = payload.length + 2;
  return [0xff, marker, length >>> 8, length & 255, ...payload];
}

function cmykJpeg(...segments) {
  const sof = segment(0xc0, [8, 0, 9, 0, 17, 4, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0, 4, 0x11, 0]);
  return Uint8Array.from([0xff, 0xd8, ...segments.flat(), ...sof, 0xff, 0xd9]);
}

test('L66 a CMYK JPEG is inverted exactly when it carries an Adobe APP14 marker', () => {
  const adobe = transform => segment(0xee, [65, 100, 111, 98, 101, 0, 100, 0, 0, 0, 0, transform]);
  assert.equal(Pdf.parseJpeg(cmykJpeg(adobe(0))).inverted, true, 'transform 0 is still Adobe-inverted');
  assert.equal(Pdf.parseJpeg(cmykJpeg(adobe(2))).inverted, true, 'YCCK');
  assert.equal(Pdf.parseJpeg(cmykJpeg(segment(0xee, [65, 100, 111, 98, 101]))).inverted, true,
    'a segment too short for a transform byte is still an Adobe file');
  assert.equal(Pdf.parseJpeg(cmykJpeg()).inverted, false, 'no marker: stored straight');
  assert.equal(Pdf.parseJpeg(cmykJpeg(segment(0xee, [65, 100, 111, 98, 0]))).inverted, false, 'not Adobe');
});

test('L66 a libjpeg Adobe CMYK file with transform 0 embeds the inverting /Decode array', () => {
  assert.equal(CMYK[2], 0xff); assert.equal(CMYK[3], 0xee);
  assert.equal(CMYK[4 + 2 + 11], 0, 'fixture carries APP14 transform 0');
  const pdf = latin1(Pdf.createPdf({ compress: false }, () => new Pdf.Page({
    build: () => new Pdf.Image(new Pdf.MemoryImage(CMYK), { width: 40 })
  })));
  assert.match(pdf, /\/ColorSpace \/DeviceCMYK \/Decode \[1 0 1 0 1 0 1 0\]/);
});

// ------------------------------------------------------------------ RawImage copy

test('RawImage hands its pixels to PdfImage without a defensive full copy', () => {
  class NoCopy extends Uint8Array {
    slice() { throw new Error('RawImage copied the whole pixel buffer'); }
  }
  const pixels = new NoCopy(2 * 2 * 4).fill(200);
  const image = new Pdf.RawImage({ bytes: pixels, width: 2, height: 2 });
  pixels.fill(0);
  // The decoded channels are PdfImage's own, so later writes to the source do not leak in.
  assert.deepEqual([...image.resolve().channel('rgb')], new Array(12).fill(200));
  assert.deepEqual([...image.resolve().channel('alpha')], new Array(4).fill(200));
});
