/*
 * js_pdf tests — the phase 2.4 SVG transforms and numeric attributes.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Tests may use Node APIs; src/ may not (enforced by tools/check-source.mjs).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { transformPoint } from '../src/pdf/matrix.ts';
import { PageUnit } from '../src/pdf/page_format.ts';
import {
  SvgNumeric,
  convertStyle,
  getDouble,
  getNumeric,
  splitDoubles,
  splitNumeric
} from '../src/svg/parser.ts';
import { SvgTransform } from '../src/svg/transform.ts';
import { parseXml } from '../src/svg/xml.ts';

const element = markup => parseXml(markup).rootElement;

function assertPoint(matrix, x, y, expectedX, expectedY, tolerance = 1e-9) {
  const point = transformPoint(matrix, x, y);
  assert.ok(
    Math.abs(point.x - expectedX) <= tolerance && Math.abs(point.y - expectedY) <= tolerance,
    `expected (${x},${y}) to map to (${expectedX},${expectedY}), got (${point.x},${point.y})`
  );
}

test('an element with no transform attribute yields none, not the identity', () => {
  // The distinction is observable: upstream writes no `cm` at all in this case.
  const transform = SvgTransform.fromXml(element('<g/>'));
  assert.equal(transform.isEmpty, true);
  assert.equal(transform.matrix, null);
});

test('translate moves a point, and a single operand means no vertical move', () => {
  assertPoint(SvgTransform.fromString('translate(10, 20)').matrix, 1, 1, 11, 21);
  assertPoint(SvgTransform.fromString('translate(10)').matrix, 1, 1, 11, 1);
});

test('scale with one operand scales both axes', () => {
  assertPoint(SvgTransform.fromString('scale(3)').matrix, 2, 5, 6, 15);
  assertPoint(SvgTransform.fromString('scale(3, 1)').matrix, 2, 5, 6, 5);
});

test('rotate turns about the origin', () => {
  assertPoint(SvgTransform.fromString('rotate(90)').matrix, 1, 0, 0, 1);
});

test('rotate with a centre turns about that point instead', () => {
  // (10,10) is the centre, so it is the one point the rotation leaves alone.
  const matrix = SvgTransform.fromString('rotate(90, 10, 10)').matrix;
  assertPoint(matrix, 10, 10, 10, 10);
  assertPoint(matrix, 11, 10, 10, 11);
});

test('matrix takes its six operands in cm order', () => {
  const transform = SvgTransform.fromString('matrix(2 0 0 3 10 20)');
  assert.deepEqual(transform.matrix, [2, 0, 0, 3, 10, 20]);
});

test('a matrix with too few operands is padded rather than rejected', () => {
  assert.deepEqual(SvgTransform.fromString('matrix(1 0)').matrix, [1, 0, 0, 0, 0, 0]);
});

test('skewX and skewY lean opposite axes', () => {
  assertPoint(SvgTransform.fromString('skewX(45)').matrix, 0, 1, 1, 1);
  assertPoint(SvgTransform.fromString('skewY(45)').matrix, 1, 0, 1, 1);
});

test('several transforms compose left to right', () => {
  // Translate first, then scale in the translated frame: (0,0) lands at (10,0)
  // and one unit of x becomes two.
  const matrix = SvgTransform.fromString('translate(10 0) scale(2)').matrix;
  assertPoint(matrix, 0, 0, 10, 0);
  assertPoint(matrix, 1, 0, 12, 0);

  // The other order is not the same transform.
  const reversed = SvgTransform.fromString('scale(2) translate(10 0)').matrix;
  assertPoint(reversed, 0, 0, 20, 0);
});

test('separators between transforms are optional', () => {
  const spaced = SvgTransform.fromString('translate(10 0) scale(2)').matrix;
  const packed = SvgTransform.fromString('translate(10,0)scale(2)').matrix;
  assert.deepEqual(packed, spaced);
});

test('an unrecognized transform function is ignored, not fatal', () => {
  const matrix = SvgTransform.fromString('perspective(500) translate(5 5)').matrix;
  assertPoint(matrix, 0, 0, 5, 5);
});

test('a length carries its unit into PDF points', () => {
  assert.equal(SvgNumeric.parse('12', null).sizeValue, 12);
  assert.equal(SvgNumeric.parse('12px', null).sizeValue, 12);
  assert.equal(SvgNumeric.parse('12pt', null).sizeValue, 12);
  assert.equal(SvgNumeric.parse('10mm', null).sizeValue, 10 * PageUnit.mm);
  assert.equal(SvgNumeric.parse('1cm', null).sizeValue, PageUnit.cm);
  assert.equal(SvgNumeric.parse('1in', null).sizeValue, 72);
  assert.equal(SvgNumeric.parse('-3.5', null).sizeValue, -3.5);
});

test('an em length resolves against the font size in scope', () => {
  const brush = { fontSize: SvgNumeric.parse('16', null) };
  assert.equal(SvgNumeric.parse('1.5em', brush).sizeValue, 24);
  assert.throws(() => SvgNumeric.parse('1.5em', null).sizeValue, SyntaxError);
});

test('a colour component reads as a byte or as a percentage', () => {
  assert.equal(SvgNumeric.parse('255', null).colorValue, 1);
  assert.equal(SvgNumeric.parse('50%', null).colorValue, 0.5);
  assert.throws(() => SvgNumeric.parse('1cm', null).colorValue, SyntaxError);
});

test('splitDoubles reads a viewBox and splitNumeric keeps the units', () => {
  assert.deepEqual(splitDoubles('0 0 100 50'), [0, 0, 100, 50]);
  assert.deepEqual(splitDoubles('0,0,100,50'), [0, 0, 100, 50]);

  const dashes = splitNumeric('4 2', null);
  assert.deepEqual(dashes.map(n => n.value), [4, 2]);
  assert.deepEqual(splitNumeric('2mm', null).map(n => n.sizeValue), [2 * PageUnit.mm]);
});

test('getDouble and getNumeric fall back when the attribute is absent', () => {
  const rect = element('<rect x="5" width="10mm"/>');

  assert.equal(getDouble(rect, 'x'), 5);
  assert.equal(getDouble(rect, 'y'), 0, 'the documented default is zero');
  assert.equal(getDouble(rect, 'y', { defaultValue: null }), null);

  assert.equal(getNumeric(rect, 'width', null).sizeValue, 10 * PageUnit.mm);
  assert.equal(getNumeric(rect, 'height', null), null);
  assert.equal(getNumeric(rect, 'height', null, { defaultValue: 7 }).sizeValue, 7);
});

test('convertStyle flattens a style attribute onto the element', () => {
  const rect = element('<rect fill="blue" style="fill: red; stroke-width : 2 ;"/>');
  convertStyle(rect);

  assert.equal(rect.getAttribute('fill'), 'red', 'style wins over the presentation attribute');
  assert.equal(rect.getAttribute('stroke-width'), '2');
});

test('convertStyle on an element with no style changes nothing', () => {
  const rect = element('<rect fill="blue"/>');
  convertStyle(rect);
  assert.equal(rect.getAttribute('fill'), 'blue');
  assert.equal(rect.attributes.size, 1);
});

test('every transform attribute in the example SVG assets parses', () => {
  const markup = [
    'logo.svg',
    'invoice.svg',
    'calendar.svg',
    'resume.svg',
    'document.svg',
    'medail.svg'
  ];

  let count = 0;
  for (const name of markup) {
    const source = new URL(`../examples/assets/${name}`, import.meta.url);
    const document = parseXml(readFileSync(source, 'utf8'));
    for (const node of [document.rootElement, ...document.rootElement.descendants]) {
      const attribute = node.getAttribute('transform');
      if (attribute === null) continue;
      const transform = SvgTransform.fromString(attribute);
      assert.ok(transform.isNotEmpty, `${name}: "${attribute}" produced no matrix`);
      for (const value of transform.matrix) {
        assert.ok(Number.isFinite(value), `${name}: "${attribute}" produced ${value}`);
      }
      count++;
    }
  }

  assert.ok(count > 0, 'the corpus must contain transforms to be a useful check');
});
