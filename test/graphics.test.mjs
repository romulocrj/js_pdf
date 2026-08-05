/*
 * js_pdf tests — the phase 2.1 graphics path operators.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Tests may use Node APIs; src/ may not (enforced by tools/check-source.mjs).
 *
 * These assert on the emitted operator sequence, never on appearance: a content
 * stream is the port's real output, and a path that writes the wrong operands
 * is wrong whatever it happens to look like.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { PdfCanvas } from '../src/pdf/graphics.ts';
import { PdfGraphicState } from '../src/pdf/graphic_state.ts';
import {
  composeMatrices,
  flipMatrix,
  identityMatrix,
  invertMatrix,
  multiplyMatrix,
  rotationMatrix,
  scaleMatrix,
  transformPoint,
  translationMatrix
} from '../src/pdf/matrix.ts';
import { PdfRect } from '../src/pdf/rect.ts';

/** The operator stream as one space-separated line, which is how a reader sees it. */
const flat = canvas => canvas.output().trim().split('\n').join(' ');

function assertClose(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

test('a path writes its operands in PDF operator order', () => {
  const canvas = new PdfCanvas(842);
  canvas.moveTo(10, 20);
  canvas.lineTo(30, 40);
  canvas.curveTo(1, 2, 3, 4, 5, 6);
  canvas.closePath();
  canvas.fillPath();

  assert.equal(flat(canvas), '10 20 m 30 40 l 1 2 3 4 5 6 c h f');
});

test('the fill rules and the close flag select the right painting operator', () => {
  const cases = [
    [canvas => canvas.fillPath(), 'f'],
    [canvas => canvas.fillPath({ evenOdd: true }), 'f*'],
    [canvas => canvas.strokePath(), 'S'],
    [canvas => canvas.strokePath({ close: true }), 's'],
    [canvas => canvas.fillAndStrokePath(), 'B'],
    [canvas => canvas.fillAndStrokePath({ evenOdd: true }), 'B*'],
    [canvas => canvas.fillAndStrokePath({ close: true }), 'b'],
    [canvas => canvas.fillAndStrokePath({ close: true, evenOdd: true }), 'b*'],
    [canvas => canvas.clipPath(), 'W n'],
    [canvas => canvas.clipPath({ evenOdd: true }), 'W* n'],
    [canvas => canvas.clipPath({ end: false }), 'W']
  ];

  for (const [draw, expected] of cases) {
    const canvas = new PdfCanvas(842);
    draw(canvas);
    assert.equal(flat(canvas), expected);
  }
});

test('the pen state operators are emitted with the operands PDF names them by', () => {
  const canvas = new PdfCanvas(842);
  canvas.setLineWidth(2.5);
  canvas.setLineCap('round');
  canvas.setLineJoin('bevel');
  canvas.setMiterLimit(4);
  canvas.setLineDashPattern([2, 1], 3);
  canvas.setLineDashPattern();

  assert.equal(flat(canvas), '2.5 w 1 J 2 j 4 M [2 1] 3 d [] 0 d');
});

test('a miter limit below 1 is rejected rather than written', () => {
  const canvas = new PdfCanvas(842);
  assert.throws(() => canvas.setMiterLimit(0.5), RangeError);
});

test('drawRect and drawBox describe the same rectangle', () => {
  const fromNumbers = new PdfCanvas(842);
  fromNumbers.drawRect(5, 6, 7, 8);

  const fromRect = new PdfCanvas(842);
  fromRect.drawBox(PdfRect.fromLTRB(5, 6, 12, 14));

  assert.equal(flat(fromNumbers), '5 6 7 8 re');
  assert.equal(flat(fromRect), flat(fromNumbers));
});

test('an ellipse is four curves closing back on its start point', () => {
  const canvas = new PdfCanvas(842);
  canvas.drawEllipse(100, 200, 50, 30);

  const operators = canvas.output().trim().split('\n');
  assert.equal(operators.length, 5);
  assert.equal(operators[0], '100 170 m');
  assert.equal(operators.filter(line => line.endsWith(' c')).length, 4);
  // The last curve has to land where the first `m` started, or the fill leaks.
  assert.ok(operators[4].endsWith('100 170 c'));
});

test('winding direction reverses when an ellipse is drawn anticlockwise', () => {
  const clockwise = new PdfCanvas(842);
  clockwise.drawEllipse(0, 0, 10, 10);

  const anticlockwise = new PdfCanvas(842);
  anticlockwise.drawEllipse(0, 0, 10, 10, false);

  assert.notEqual(flat(clockwise), flat(anticlockwise));
  // Both start at the same point; only the order of the four quadrants differs.
  assert.equal(clockwise.output().split('\n')[0], anticlockwise.output().split('\n')[0]);
});

test('a rounded rectangle alternates curves and lines and returns to its start', () => {
  const canvas = new PdfCanvas(842);
  canvas.drawRRect(10, 10, 100, 50, 5, 5);

  const operators = canvas.output().trim().split('\n');
  assert.equal(operators[0], '10 15 m');
  assert.equal(operators.filter(line => line.endsWith(' c')).length, 4);
  assert.equal(operators.filter(line => line.endsWith(' l')).length, 4);
  assert.equal(operators[operators.length - 1], '10 15 l');
});

test('a quarter-circle arc becomes one cubic that lands on the endpoint', () => {
  const canvas = new PdfCanvas(842);
  canvas.moveTo(100, 0);
  canvas.bezierArc(100, 0, 100, 100, 0, 100, { sweep: true });

  const operators = canvas.output().trim().split('\n');
  assert.equal(operators.length, 2);
  assert.ok(operators[1].endsWith(' c'));

  const operands = operators[1].split(' ').slice(0, 6).map(Number);
  assertClose(operands[4], 0, 1e-4);
  assertClose(operands[5], 100, 1e-4);
});

test('an arc with degenerate radii degrades to a straight line', () => {
  const canvas = new PdfCanvas(842);
  canvas.bezierArc(0, 0, 0, 0, 10, 10);
  assert.equal(flat(canvas), '10 10 l');
});

test('an arc between identical endpoints emits nothing at all', () => {
  const canvas = new PdfCanvas(842);
  canvas.bezierArc(5, 5, 10, 10, 5, 5);
  assert.equal(canvas.output().trim(), '');
});

test('an arc splits into one cubic per quadrant it sweeps', () => {
  // A cubic cannot approximate more than a quarter turn accurately, so the
  // fragment count is the observable proof the sweep was computed at all.
  const curvesFor = (x2, y2, options) => {
    const canvas = new PdfCanvas(842);
    canvas.moveTo(100, 0);
    canvas.bezierArc(100, 0, 100, 100, x2, y2, options);
    return canvas.output().trim().split('\n').filter(line => line.endsWith(' c')).length;
  };

  assert.equal(curvesFor(0, 100, { sweep: true }), 1, 'a quarter turn');
  assert.equal(curvesFor(-100, 0, { sweep: true, large: true }), 2, 'a half turn');
  assert.equal(curvesFor(0, -100, { sweep: true, large: true }), 3, 'three quarters');
});

test('cm composes onto the current transform and q/Q restore it', () => {
  const canvas = new PdfCanvas(842);
  assert.deepEqual(canvas.getTransform(), identityMatrix);

  canvas.saveContext();
  canvas.setTransform(translationMatrix(10, 20));
  canvas.setTransform(scaleMatrix(2, 2));

  // Translate then scale: the scale applies in the translated frame.
  assert.deepEqual(canvas.getTransform(), [2, 0, 0, 2, 10, 20]);

  canvas.restoreContext();
  assert.deepEqual(canvas.getTransform(), identityMatrix);
  assert.equal(flat(canvas), 'q 1 0 0 1 10 20 cm 2 0 0 2 0 0 cm Q');
});

test('restoring with nothing saved writes no Q', () => {
  const canvas = new PdfCanvas(842);
  canvas.restoreContext();
  assert.equal(canvas.output().trim(), '');
});

test('equal graphic states share one name and one dictionary', () => {
  const canvas = new PdfCanvas(842);
  const first = canvas.setGraphicState(new PdfGraphicState({ opacity: 0.5 }));
  const second = canvas.setGraphicState(new PdfGraphicState({ opacity: 0.5 }));
  const third = canvas.setGraphicState(new PdfGraphicState({ opacity: 0.25 }));

  assert.equal(first, '/g1');
  assert.equal(second, '/g1');
  assert.equal(third, '/g2');
  assert.equal(canvas.graphicStates.size, 2);
  assert.equal(flat(canvas), '/g1 gs /g1 gs /g2 gs');
});

test('an empty graphic state is not written', () => {
  const canvas = new PdfCanvas(842);
  assert.equal(canvas.setGraphicState(new PdfGraphicState()), null);
  assert.equal(canvas.output().trim(), '');
});

test('a graphic state reaches the page /Resources as an inline dictionary', () => {
  const canvas = new PdfCanvas(842);
  canvas.setGraphicState(new PdfGraphicState({ fillOpacity: 0.4, blendMode: 'multiply' }));

  const dict = canvas.graphicStates.get('/g1');
  assert.ok(dict);
  assert.equal(dict.has('/ca'), true);
  assert.equal(dict.has('/CA'), false);
  assert.equal(dict.has('/BM'), true);
});

test('text spacing operators reset when later runs use defaults', () => {
  const canvas = new PdfCanvas(842);
  canvas.text('A', 10, 20, { fontSize: 12, color: '#000000', letterSpacing: 2, wordSpacing: 3 });
  canvas.text('B', 10, 40, { fontSize: 12, color: '#000000' });
  canvas.text('C', 10, 60, { fontSize: 12, color: '#000000' });

  const lines = canvas.output().trim().split('\n');
  assert.match(lines[0] ?? '', / 2 Tc 3 Tw /);
  assert.match(lines[1] ?? '', / 0 Tc 0 Tw /);
  assert.doesNotMatch(lines[2] ?? '', / Tc|Tw/);
});

test('matrix composition matches applying the transforms in order', () => {
  const move = translationMatrix(10, 0);
  const grow = scaleMatrix(2, 2);

  // composeMatrices reads left to right, the way an SVG transform attribute does.
  const composed = composeMatrices([move, grow]);
  const point = transformPoint(composed, 1, 1);
  assert.deepEqual(point, { x: 12, y: 2 });

  assert.deepEqual(multiplyMatrix(move, grow), composed);
});

test('a rotation is undone by its inverse', () => {
  const rotated = rotationMatrix(Math.PI / 3);
  const inverse = invertMatrix(rotated);
  assert.ok(inverse);

  const point = transformPoint(multiplyMatrix(rotated, inverse), 7, -3);
  assertClose(point.x, 7);
  assertClose(point.y, -3);
});

test('a singular matrix reports that it cannot be inverted', () => {
  assert.equal(invertMatrix([0, 0, 0, 0, 0, 0]), null);
});

test('flipMatrix turns a y-down transform into the PDF-space equivalent', () => {
  const height = 800;

  // Moving 100 units "down" in widget space is 100 units toward smaller y in
  // PDF space, so the flipped translation has to carry the opposite sign.
  const flipped = flipMatrix(translationMatrix(0, 100), height);
  assert.deepEqual(flipped, [1, 0, 0, 1, 0, -100]);

  // A widget-space point maps the same whichever way it is computed.
  const widgetPoint = { x: 30, y: 200 };
  const viaFlip = transformPoint(flipped, widgetPoint.x, height - widgetPoint.y);
  assert.equal(viaFlip.x, 30);
  assert.equal(viaFlip.y, height - (widgetPoint.y + 100));
});

test('toPdfY is the flip the shape helpers apply', () => {
  const canvas = new PdfCanvas(842);
  assert.equal(canvas.toPdfY(0), 842);
  assert.equal(canvas.toPdfY(842), 0);
});

test('the y-down shape helpers still emit what they always did', () => {
  const canvas = new PdfCanvas(800);
  canvas.fillRect(10, 20, 100, 50, '#ff0000');

  assert.equal(flat(canvas), '1 0 0 rg 10 730 100 50 re f');
});
