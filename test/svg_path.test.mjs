/*
 * js_pdf tests — the phase 2.2 SVG path data parser.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Tests may use Node APIs; src/ may not (enforced by tools/check-source.mjs).
 *
 * The parser's contract is the sequence of move / line / cubic / close calls it
 * makes, so that is what these assert on. A recording proxy is the whole fixture.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PdfCanvas } from '../src/pdf/graphics.ts';
import {
  drawShape,
  shapeBoundingBox,
  writeSvgPathDataToPath
} from '../src/svg/path.ts';

/** Records the normalized calls as `verb x y …` strings, rounded for reading. */
class Recorder {
  constructor() {
    this.calls = [];
  }

  static round(value) {
    return Math.round(value * 1000) / 1000;
  }

  moveTo(x, y) {
    this.calls.push(`M ${Recorder.round(x)} ${Recorder.round(y)}`);
  }

  lineTo(x, y) {
    this.calls.push(`L ${Recorder.round(x)} ${Recorder.round(y)}`);
  }

  cubicTo(x1, y1, x2, y2, x3, y3) {
    this.calls.push(
      `C ${Recorder.round(x1)} ${Recorder.round(y1)} ${Recorder.round(x2)} ${Recorder.round(y2)}`
      + ` ${Recorder.round(x3)} ${Recorder.round(y3)}`
    );
  }

  close() {
    this.calls.push('Z');
  }
}

const parse = d => {
  const recorder = new Recorder();
  writeSvgPathDataToPath(d, recorder);
  return recorder.calls;
};

test('absolute and relative forms of the same path agree', () => {
  const absolute = parse('M 10 10 L 20 10 L 20 20 Z');
  const relative = parse('m 10 10 l 10 0 l 0 10 z');

  assert.deepEqual(absolute, ['M 10 10', 'L 20 10', 'L 20 20', 'Z']);
  assert.deepEqual(relative, absolute);
});

test('horizontal and vertical commands keep the coordinate they omit', () => {
  assert.deepEqual(parse('M 5 7 H 15 V 20 h -5 v -3'), [
    'M 5 7',
    'L 15 7',
    'L 15 20',
    'L 10 20',
    'L 10 17'
  ]);
});

test('a repeated number continues the previous command', () => {
  // Implicit repetition of a moveto is a lineto, which is the rule most easily
  // got wrong: `M 0 0 1 1` draws a line, it does not move twice.
  assert.deepEqual(parse('M 0 0 1 1 2 2'), ['M 0 0', 'L 1 1', 'L 2 2']);
  assert.deepEqual(parse('M 0 0 L 1 1 2 2'), ['M 0 0', 'L 1 1', 'L 2 2']);
});

test('close does not repeat implicitly', () => {
  assert.throws(() => parse('M 0 0 Z 5 5'), SyntaxError);
});

test('the compact number syntax is accepted', () => {
  // No delimiter is required where the sign or the second point already
  // separates the numbers, and `.5.5` is two numbers.
  assert.deepEqual(parse('M0 0L-1-2'), ['M 0 0', 'L -1 -2']);
  assert.deepEqual(parse('M0,0L.5.5'), ['M 0 0', 'L 0.5 0.5']);
  assert.deepEqual(parse('M 0 0 L 1e2 -1.5e-1'), ['M 0 0', 'L 100 -0.15']);
});

test('a quadratic is raised to a cubic', () => {
  // Q (0,0)->(10,0) with control (5,10): the cubic controls sit two thirds of
  // the way from each endpoint toward the quadratic control point.
  assert.deepEqual(parse('M 0 0 Q 5 10 10 0'), [
    'M 0 0',
    'C 3.333 6.667 6.667 6.667 10 0'
  ]);
});

test('a smooth cubic reflects the previous control point', () => {
  const calls = parse('M 0 0 C 0 10 10 10 10 0 S 20 -10 20 0');
  assert.equal(calls.length, 3);
  // The previous second control was (10,10) and the current point is (10,0),
  // so the reflection is (10,-10).
  assert.equal(calls[2], 'C 10 -10 20 -10 20 0');
});

test('a smooth cubic with no cubic before it uses the current point', () => {
  const calls = parse('M 4 4 S 20 -10 20 0');
  assert.equal(calls[1], 'C 4 4 20 -10 20 0');
});

test('a smooth quadratic reflects the previous quadratic control point', () => {
  const calls = parse('M 0 0 Q 5 10 10 0 T 20 0');
  assert.equal(calls.length, 3);
  // Reflecting (5,10) through (10,0) gives (15,-10); blending that control
  // with each endpoint at 1:2 gives (13.333,-6.667) and (16.667,-6.667).
  assert.equal(calls[2], 'C 13.333 -6.667 16.667 -6.667 20 0');
});

test('an arc becomes one cubic per quarter turn and lands on its endpoint', () => {
  const calls = parse('M 100 0 A 100 100 0 0 1 0 100');
  assert.equal(calls.length, 2);
  assert.ok(calls[1].startsWith('C '));
  assert.ok(calls[1].endsWith(' 0 100'), `expected to end at (0,100), got ${calls[1]}`);
});

test('the large-arc and sweep flags pick different arcs between the same points', () => {
  const arcs = ['0 0', '0 1', '1 0', '1 1'].map(flags =>
    parse(`M 100 0 A 100 100 0 ${flags} 0 100`).join(' ')
  );

  assert.equal(new Set(arcs).size, 4, 'each flag combination must draw a distinct arc');
  for (const arc of arcs) {
    assert.ok(arc.endsWith(' 0 100'), `every combination still ends at (0,100): ${arc}`);
  }
});

test('an arc with a zero radius degrades to a line', () => {
  assert.deepEqual(parse('M 0 0 A 0 50 0 0 1 10 10'), ['M 0 0', 'L 10 10']);
});

test('an arc whose radii cannot reach the endpoint is scaled up', () => {
  // Radii of 1 cannot span 100 units; the spec says to scale them, not to fail.
  const calls = parse('M 0 0 A 1 1 0 0 1 100 0');
  assert.ok(calls.length > 1);
  assert.ok(calls[calls.length - 1].endsWith(' 100 0'));
});

test('a rotated arc differs from the same arc unrotated', () => {
  const upright = parse('M 0 0 A 50 25 0 0 1 100 0').join(' ');
  const rotated = parse('M 0 0 A 50 25 45 0 1 100 0').join(' ');
  assert.notEqual(upright, rotated);
});

test('a subpath closes back to the point its moveto opened', () => {
  const calls = parse('M 10 10 L 20 10 Z L 30 30');
  // After `Z` the current point is the subpath start, so the following line
  // starts from (10,10) — that is what `Z` restoring the point means.
  assert.deepEqual(calls, ['M 10 10', 'L 20 10', 'Z', 'L 30 30']);
});

test('several subpaths each remember their own start', () => {
  assert.deepEqual(parse('M 0 0 L 5 0 Z M 10 10 L 15 10 Z'), [
    'M 0 0',
    'L 5 0',
    'Z',
    'M 10 10',
    'L 15 10',
    'Z'
  ]);
});

test('empty and missing path data draw nothing', () => {
  assert.deepEqual(parse(''), []);
  assert.deepEqual(parse(null), []);
  assert.deepEqual(parse(undefined), []);
});

test('path data that does not open with a moveto is rejected', () => {
  assert.throws(() => parse('L 10 10'), SyntaxError);
});

test('a malformed number reports rather than silently yielding NaN', () => {
  assert.throws(() => parse('M 0 0 L 1 .'), SyntaxError);
  assert.throws(() => parse('M 0 0 L 1 1e'), SyntaxError);
  assert.throws(() => parse('M 0 0 A 1 1 0 2 1 10 10'), SyntaxError);
});

test('drawShape writes the path straight into a content stream', () => {
  const canvas = new PdfCanvas(842);
  drawShape(canvas, 'M 10 20 L 30 20 Z');
  canvas.fillPath();

  assert.equal(canvas.output().trim().split('\n').join(' '), '10 20 m 30 20 l h f');
});

test('the bounding box contains a curve that bulges past its control points', () => {
  // The cubic's extreme is at t=0.5, y = 7.5 — not at any control point.
  const box = shapeBoundingBox('M 0 0 C 0 10 10 10 10 0');
  assert.equal(box.x, 0);
  assert.equal(box.y, 0);
  assert.equal(box.width, 10);
  assert.equal(Math.round(box.height * 100) / 100, 7.5);
});

test('the bounding box of a rectangle path is the rectangle', () => {
  const box = shapeBoundingBox('M 10 20 H 40 V 50 H 10 Z');
  assert.deepEqual(box, { x: 10, y: 20, width: 30, height: 30 });
});

test('an empty path has a zero bounding box rather than an infinite one', () => {
  assert.deepEqual(shapeBoundingBox(''), { x: 0, y: 0, width: 0, height: 0 });
});

test('every path in the example SVG assets parses', () => {
  const files = [
    'logo.svg',
    'invoice.svg',
    'calendar.svg',
    'document.svg',
    'resume.svg',
    'medail.svg',
    'garland.svg'
  ];

  let total = 0;
  for (const name of files) {
    const markup = readFileSync(new URL(`../examples/assets/${name}`, import.meta.url), 'utf8');
    for (const [, d] of markup.matchAll(/\sd="([^"]+)"/g)) {
      const recorder = new Recorder();
      assert.doesNotThrow(() => writeSvgPathDataToPath(d, recorder), `${name}: ${d.slice(0, 60)}`);
      assert.ok(recorder.calls.length > 0, `${name}: a path emitted nothing`);
      total++;
    }
  }

  assert.ok(total >= 10, `expected a real corpus of paths, found ${total}`);
});
