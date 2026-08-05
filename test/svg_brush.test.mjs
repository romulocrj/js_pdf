/*
 * js_pdf tests — the phase 2.5 SVG paint state: colours, brushes and the
 * document-level parser.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Tests may use Node APIs; src/ may not (enforced by tools/check-source.mjs).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SvgBrush } from '../src/svg/brush.ts';
import { SvgColor } from '../src/svg/color.ts';
import { svgColors } from '../src/svg/colors.ts';
import { SvgParser } from '../src/svg/parser.ts';
import { parseXml } from '../src/svg/xml.ts';

const parserFor = (markup, colorFilter = null) =>
  SvgParser.fromXml({ xml: parseXml(markup), colorFilter });

const bareParser = parserFor('<svg/>');

const element = markup => parseXml(markup).rootElement;

const round = rgb => rgb === null ? null : rgb.map(v => Math.round(v * 1000) / 1000);

test('the named colour table is upstream\'s, in full', () => {
  assert.equal(Object.keys(svgColors).length, 148);
  assert.equal(svgColors.black, '#000000');
  assert.equal(svgColors.rebeccapurple, undefined, 'absent upstream, so absent here');
});

test('a named colour resolves to its RGB triple', () => {
  assert.deepEqual(SvgColor.fromXml('red', bareParser).color, [1, 0, 0]);
  assert.deepEqual(SvgColor.fromXml('WHITE', bareParser).color, [1, 1, 1]);
});

test('hex colours resolve in both the three- and six-digit forms', () => {
  assert.deepEqual(SvgColor.fromXml('#ff0000', bareParser).color, [1, 0, 0]);
  assert.deepEqual(SvgColor.fromXml('#f00', bareParser).color, [1, 0, 0]);
});

test('the functional colour syntaxes resolve', () => {
  assert.deepEqual(SvgColor.fromXml('rgb(255, 0, 0)', bareParser).color, [1, 0, 0]);
  assert.deepEqual(SvgColor.fromXml('rgb(100%, 0%, 0%)', bareParser).color, [1, 0, 0]);

  // The alpha operand is read and dropped: the port's colour type has none.
  assert.deepEqual(SvgColor.fromXml('rgba(255, 0, 0, 0.5)', bareParser).color, [1, 0, 0]);

  assert.deepEqual(round(SvgColor.fromXml('hsl(0, 100%, 50%)', bareParser).color), [1, 0, 0]);
  assert.deepEqual(
    round(SvgColor.fromXml('hsl(33.333333333%, 100%, 50%)', bareParser).color),
    [0, 1, 0]
  );
});

test('none, an absent attribute and an unreadable one are three different values', () => {
  const none = SvgColor.fromXml('none', bareParser);
  const absent = SvgColor.fromXml(null, bareParser);
  const unknown = SvgColor.fromXml('not-a-colour', bareParser);

  assert.equal(none.isEmpty, true);
  assert.equal(none.inherit, false);

  assert.equal(absent.isEmpty, true);
  assert.equal(absent.inherit, true, 'an absent attribute inherits the parent paint');

  assert.equal(unknown.isEmpty, true);
  assert.equal(unknown.inherit, false, 'unreadable is not the same as unstated');
});

test('a gradient reference is unpainted rather than guessed at', () => {
  // Gradients are phase 2.8; filling with an arbitrary colour would be worse
  // than drawing nothing.
  assert.equal(SvgColor.fromXml('url(#grad1)', bareParser).isEmpty, true);
});

test('a colour filter overrides every colour in the document', () => {
  const parser = parserFor('<svg/>', [0, 0, 1]);
  assert.deepEqual(SvgColor.fromXml('red', parser).color, [0, 0, 1]);
  assert.deepEqual(SvgColor.fromXml('#123456', parser).color, [0, 0, 1]);

  // `none` still wins: the filter recolours what is painted, it does not paint
  // what was told not to be.
  assert.equal(SvgColor.fromXml('none', parser).isEmpty, true);
});

test('the default brush is what an SVG paints with before any attribute', () => {
  const brush = SvgBrush.defaultContext;
  assert.deepEqual(brush.fill.color, [0, 0, 0]);
  assert.equal(brush.stroke.isEmpty, true);
  assert.equal(brush.strokeWidth.sizeValue, 1);
  assert.equal(brush.strokeLineCap, 'butt');
  assert.equal(brush.strokeLineJoin, 'miter');
  assert.equal(brush.strokeMiterLimit, 4);
  assert.equal(brush.fillEvenOdd, false);
  assert.equal(brush.opacity, 1);
});

test('an element inherits what it does not state', () => {
  const parent = SvgBrush.defaultContext.copyWith({
    fill: new SvgColor([1, 0, 0]),
    strokeWidth: SvgBrush.defaultContext.strokeWidth
  });

  const brush = SvgBrush.fromXml(element('<path stroke="blue"/>'), parent, bareParser);

  assert.deepEqual(brush.fill.color, [1, 0, 0], 'fill was not restated, so it inherits');
  assert.deepEqual(brush.stroke.color, [0, 0, 1]);
});

test('currentColor follows the inherited color presentation property', () => {
  const parent = SvgBrush.defaultContext.copyWith({ color: new SvgColor([1, 0, 0]) });
  const inherited = SvgBrush.fromXml(
    element('<path fill="currentColor"/>'), parent, bareParser
  );
  const local = SvgBrush.fromXml(
    element('<path color="blue" stroke="currentColor"/>'), parent, bareParser
  );

  assert.deepEqual(inherited.fill.color, [1, 0, 0]);
  assert.deepEqual(local.stroke.color, [0, 0, 1]);
});

test('opacity and blend mode do not inherit, which is what the spec says', () => {
  const parent = SvgBrush.defaultContext.copyWith({ opacity: 0.5, blendMode: 'multiply' });
  const brush = SvgBrush.fromXml(element('<path/>'), parent, bareParser);

  assert.equal(brush.opacity, 1);
  assert.equal(brush.blendMode, null);
});

test('stroke-linejoin: miter is honoured, where upstream mis-spells the key', () => {
  // Upstream's table spells it 'miter ' with a trailing space, so an element
  // asking for the default join silently inherited its parent's instead.
  const parent = SvgBrush.defaultContext.copyWith({ strokeLineJoin: 'round' });
  const brush = SvgBrush.fromXml(element('<path stroke-linejoin="miter"/>'), parent, bareParser);
  assert.equal(brush.strokeLineJoin, 'miter');
});

test('color-dodge and color-burn map to their own blend modes', () => {
  // Upstream maps both to `color`.
  const dodge = SvgBrush.fromXml(
    element('<path mix-blend-mode="color-dodge"/>'), SvgBrush.defaultContext, bareParser
  );
  const burn = SvgBrush.fromXml(
    element('<path mix-blend-mode="color-burn"/>'), SvgBrush.defaultContext, bareParser
  );

  assert.equal(dodge.blendMode, 'colorDodge');
  assert.equal(burn.blendMode, 'colorBurn');
});

test('a style attribute is flattened onto the element before it is read', () => {
  const brush = SvgBrush.fromXml(
    element('<path fill="blue" style="fill:red;stroke-width:3"/>'),
    SvgBrush.defaultContext,
    bareParser
  );

  assert.deepEqual(brush.fill.color, [1, 0, 0], 'style wins over the attribute');
  assert.equal(brush.strokeWidth.sizeValue, 3);
});

test('fill-rule selects the even-odd winding rule', () => {
  const evenOdd = SvgBrush.fromXml(
    element('<path fill-rule="evenodd"/>'), SvgBrush.defaultContext, bareParser
  );
  const nonZero = SvgBrush.fromXml(
    element('<path fill-rule="nonzero"/>'), SvgBrush.defaultContext, bareParser
  );

  assert.equal(evenOdd.fillEvenOdd, true);
  assert.equal(nonZero.fillEvenOdd, false);
});

test('stroke-dasharray reads a pattern, and none clears it', () => {
  const dashed = SvgBrush.fromXml(
    element('<path stroke-dasharray="4 2"/>'), SvgBrush.defaultContext, bareParser
  );
  const solid = SvgBrush.fromXml(
    element('<path stroke-dasharray="none"/>'), SvgBrush.defaultContext, bareParser
  );

  assert.deepEqual(dashed.strokeDashArray, [4, 2]);
  assert.deepEqual(solid.strokeDashArray, []);
});

test('the viewBox is read, and defaults to the document size when absent', () => {
  assert.deepEqual(
    parserFor('<svg viewBox="0 0 100 50"/>').viewBox,
    { x: 0, y: 0, width: 100, height: 50 }
  );

  assert.deepEqual(
    parserFor('<svg width="200" height="80"/>').viewBox,
    { x: 0, y: 0, width: 200, height: 80 }
  );

  // Neither stated: upstream's 1000-unit stand-in.
  assert.deepEqual(parserFor('<svg/>').viewBox, { x: 0, y: 0, width: 1000, height: 1000 });
});

test('a short viewBox is left-padded, and an over-long one is rejected', () => {
  assert.deepEqual(parserFor('<svg viewBox="100 50"/>').viewBox, { x: 0, y: 0, width: 100, height: 50 });
  assert.throws(() => parserFor('<svg viewBox="1 2 3 4 5"/>'), SyntaxError);
});

test('the document reports its intrinsic size with units applied', () => {
  const parser = parserFor('<svg width="10mm" height="20mm" viewBox="0 0 10 20"/>');
  assert.equal(Math.round(parser.width * 100) / 100, 28.35);
  assert.equal(Math.round(parser.height * 100) / 100, 56.69);
});

test('findById reaches any element in the document, including the root', () => {
  const parser = parserFor('<svg id="root"><defs><g id="a"><rect id="b"/></g></defs></svg>');

  assert.equal(parser.findById('a').name.local, 'g');
  assert.equal(parser.findById('b').name.local, 'rect');
  assert.equal(parser.findById('root').name.local, 'svg');
  assert.equal(parser.findById('missing'), null);
});

test('every SVG asset the examples load yields a parser and a brush', () => {
  const files = [
    'logo.svg',
    'invoice.svg',
    'calendar.svg',
    'document.svg',
    'resume.svg',
    'medail.svg',
    'garland.svg'
  ];

  for (const name of files) {
    const markup = readFileSync(new URL(`../examples/assets/${name}`, import.meta.url), 'utf8');
    const parser = SvgParser.fromXml({ xml: parseXml(markup) });

    assert.ok(parser.viewBox.width > 0, `${name}: viewBox has no width`);

    for (const node of [parser.root, ...parser.root.descendants]) {
      assert.doesNotThrow(
        () => SvgBrush.fromXml(node, SvgBrush.defaultContext, parser),
        `${name}: <${node.name.local}> broke the brush`
      );
    }
  }
});
