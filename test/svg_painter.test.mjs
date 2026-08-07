/*
 * js_pdf tests — phase 2.5 SVG shapes, painter, groups and references.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Tests may use Node APIs; src/ may not (enforced by tools/check-source.mjs).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PdfCanvas } from '../src/pdf/graphics.ts';
import { SvgPainter } from '../src/svg/painter.ts';
import { SvgParser } from '../src/svg/parser.ts';
import { parseXml } from '../src/svg/xml.ts';

const paint = markup => {
  const parser = SvgParser.fromXml({ xml: parseXml(markup) });
  const canvas = new PdfCanvas(200);
  new SvgPainter(parser, canvas, parser.viewBox).paint();
  return { canvas, output: canvas.output().trim().split('\n') };
};

test('path fill and stroke emit their complete paint state', () => {
  const { output } = paint(`
    <svg viewBox="0 0 100 100">
      <path d="M 1 2 L 3 4 Z" fill="#ff0000" stroke="#0000ff"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="bevel"
        stroke-miterlimit="5" stroke-dasharray="4 2" stroke-dashoffset="1"/>
    </svg>
  `);

  assert.deepEqual(output, [
    'q',
    'q',
    'q',
    '1 0 0 rg',
    '1 2 m', '3 4 l', 'h', 'f',
    'Q',
    'q',
    '0 0 1 RG',
    '1 2 m', '3 4 l', 'h',
    '1 J', '2 j', '5 M', '[4 2] 1 d', '2 w', 'S',
    'Q',
    'Q',
    'Q'
  ]);
});

test('all basic shape elements become paths', () => {
  const { output } = paint(`
    <svg viewBox="0 0 100 100" fill="none" stroke="black">
      <rect x="1" y="2" width="3" height="4"/>
      <circle cx="10" cy="10" r="2"/>
      <ellipse cx="20" cy="20" rx="3" ry="2"/>
      <line x1="1" y1="9" x2="4" y2="6"/>
      <polyline points="1,1 2,2 3,1"/>
      <polygon points="5,5 7,5 6,7"/>
    </svg>
  `);

  assert.equal(output.filter(line => line === 'S').length, 6);
  assert.ok(output.includes('1 2 m'));
  assert.ok(output.includes('1 9 m'));
  assert.ok(output.includes('4 6 l'));
  assert.ok(output.filter(line => line === 'h').length >= 2);
});

test('text and tspan content emit font resources and text operators', () => {
  const { output, canvas } = paint(`
    <svg viewBox="0 0 100 30">
      <text x="10" y="20" font-size="12">Hello<tspan dx="2"> SVG</tspan></text>
    </svg>
  `);
  assert.ok(output.some(line => line.includes('(Hello) Tj')));
  assert.ok(output.some(line => line.includes('(SVG) Tj')));
  assert.equal(canvas.fonts.size, 1);
});

test('a base64 raster image becomes an SVG image operation', () => {
  const jpeg = readFileSync(new URL('../examples/assets/profile.jpg', import.meta.url)).toString('base64');
  const { output, canvas } = paint(`
    <svg viewBox="0 0 20 20">
      <image x="2" y="3" width="10" height="12" href="data:image/jpeg;base64,${jpeg}"/>
    </svg>
  `);
  assert.ok(output.some(line => /\/I1 Do/.test(line)));
  assert.equal(canvas.images.size, 1);
});

test('masked SVG content registers a deferred luminosity soft mask', () => {
  const { canvas, output } = paint(`
    <svg viewBox="0 0 10 10">
      <mask id="m"><rect width="5" height="10" fill="white"/></mask>
      <rect width="10" height="10" mask="url(#m)"/>
    </svg>
  `);

  assert.ok(output.some(line => /^\/g\d+ gs$/.test(line)));
  assert.equal(canvas.graphicStates.size, 1);
  assert.equal(canvas.graphicStates.values().next().value.has('/SMask'), true);
});

test('nested groups inherit paint, scope transforms and skip hidden content', () => {
  const { output } = paint(`
    <svg viewBox="0 0 100 100">
      <g fill="red" transform="translate(10 20)">
        <path d="M0 0L1 1"/>
        <path display="none" d="M2 2L3 3"/>
        <path visibility="hidden" d="M4 4L5 5"/>
      </g>
    </svg>
  `);

  assert.ok(output.includes('1 0 0 1 10 20 cm'));
  assert.equal(output.filter(line => line === '1 0 0 rg').length, 1);
  assert.ok(!output.includes('2 2 m'));
  assert.ok(!output.includes('4 4 m'));
});

test('element opacity, fill opacity and blend mode register graphic states', () => {
  const { canvas, output } = paint(`
    <svg viewBox="0 0 10 10">
      <path opacity="0.5" fill-opacity="0.25" mix-blend-mode="multiply"
        d="M0 0L10 0L10 10Z"/>
    </svg>
  `);

  assert.ok(output.includes('/g1 gs'));
  assert.ok(output.includes('/g2 gs'));
  assert.equal(canvas.graphicStates.size, 2);
  assert.equal(canvas.graphicStates.get('/g1').has('/BM'), true);
  assert.equal(canvas.graphicStates.get('/g1').has('/ca'), true);
  assert.equal(canvas.graphicStates.get('/g2').has('/BM'), false);
  assert.equal(canvas.graphicStates.get('/g2').has('/ca'), true);
});

test('use resolves href and namespaced href, translating the referenced symbol', () => {
  const regular = paint(`
    <svg viewBox="0 0 100 100">
      <symbol id="mark"><path d="M1 2L3 4" fill="blue"/></symbol>
      <use href="#mark" x="10" y="20"/>
    </svg>
  `).output;
  const namespaced = paint(`
    <svg xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100">
      <path id="mark" d="M1 2L3 4"/>
      <use xlink:href="#mark" x="5"/>
    </svg>
  `).output;

  assert.ok(regular.includes('1 0 0 1 10 20 cm'));
  assert.ok(regular.includes('0 0 1 rg'));
  assert.ok(regular.includes('1 2 m'));
  assert.ok(namespaced.includes('1 0 0 1 5 0 cm'));
  assert.equal(namespaced.filter(line => line === '1 2 m').length, 2);
});

test('a missing reference is ignored and an unknown element does not abort siblings', () => {
  const { output } = paint(`
    <svg viewBox="0 0 10 10">
      <use href="#missing"/>
      <metadata>ignored</metadata>
      <rect width="2" height="3"/>
    </svg>
  `);

  assert.ok(output.includes('0 0 m'));
  assert.ok(output.includes('f'));
});

test('clipPath builds a path and consumes it before the target paints', () => {
  const { output } = paint(`
    <svg viewBox="0 0 100 100">
      <defs><clipPath id="cut"><rect x="10" y="20" width="30" height="40"/></clipPath></defs>
      <rect clip-path="url(#cut)" width="100" height="100" fill="red"/>
    </svg>
  `);

  const clip = output.indexOf('W n');
  const fill = output.lastIndexOf('f');
  assert.ok(clip > 0, 'clip operator was not emitted');
  assert.ok(fill > clip, 'the target must paint after clipping is installed');
  assert.equal(output.filter(line => line === 'W n').length, 1);
  assert.ok(output.slice(0, clip).includes('10 20 m'));
});

test('clipPathUnits=objectBoundingBox maps unit coordinates onto the target box', () => {
  const { output } = paint(`
    <svg viewBox="0 0 100 100">
      <defs>
        <clipPath id="half" clipPathUnits="objectBoundingBox">
          <rect width="0.5" height="1"/>
        </clipPath>
      </defs>
      <rect x="10" y="20" width="30" height="40" clip-path="url(#half)"/>
    </svg>
  `);

  assert.ok(output.includes('30 0 0 40 10 20 cm'));
  assert.ok(output.includes('W n'));
});

test('clip-rule selects even-odd clipping and a missing clip is a no-op', () => {
  const evenOdd = paint(`
    <svg><defs><clipPath id="cut" clip-rule="evenodd"><path d="M0 0H10V10H0Z"/></clipPath></defs>
      <rect width="10" height="10" clip-path="url(#cut)"/></svg>
  `).output;
  const missing = paint('<svg><rect width="10" height="10" clip-path="url(#missing)"/></svg>').output;

  assert.ok(evenOdd.includes('W* n'));
  assert.equal(missing.some(line => line.startsWith('W')), false);
});

test('nested clipped groups keep every clip inside its own q/Q scope', () => {
  const { output } = paint(`
    <svg>
      <defs>
        <clipPath id="outer"><rect width="50" height="50"/></clipPath>
        <clipPath id="inner"><circle cx="20" cy="20" r="10"/></clipPath>
      </defs>
      <g clip-path="url(#outer)">
        <rect width="100" height="100" clip-path="url(#inner)"/>
      </g>
    </svg>
  `);

  assert.equal(output.filter(line => line === 'W n').length, 2);
  assert.equal(output.filter(line => line === 'q').length, output.filter(line => line === 'Q').length);
  assert.ok(output.indexOf('W n') < output.lastIndexOf('W n'));
});

test('operation bounding boxes are available before the widget phase', () => {
  const parser = SvgParser.fromXml({ xml: parseXml(`
    <svg viewBox="0 0 100 100"><g><rect x="10" y="20" width="30" height="40"/></g></svg>
  `) });
  const canvas = new PdfCanvas(200);
  const painter = new SvgPainter(parser, canvas, parser.viewBox);
  const root = painter.rootOperation();

  assert.deepEqual(root.boundingBox(), { x: 10, y: 20, width: 30, height: 40 });
});

test('every SVG asset used by the examples paints without a host API', () => {
  const files = [
    'calendar.svg', 'document.svg', 'garland.svg', 'invoice.svg', 'logo.svg',
    'medail.svg', 'resume.svg', 'swirls.svg', 'swirls1.svg', 'swirls2.svg',
    'swirls3.svg'
  ];

  for (const name of files) {
    const markup = readFileSync(new URL(`../examples/assets/${name}`, import.meta.url), 'utf8');
    const { output } = paint(markup);
    assert.ok(output.length > 2, `${name} emitted no operators`);
  }

  const serverAssets = JSON.parse(readFileSync(
    new URL('../examples/assets/server-assets.json', import.meta.url), 'utf8'
  ));
  let inlineCount = 0;
  for (const value of Object.values(serverAssets)) {
    if (typeof value === 'string' && value.trimStart().startsWith('<svg')) {
      assert.ok(paint(value).output.length > 2);
      inlineCount++;
    }
  }
  assert.ok(inlineCount > 0, 'server-assets.json had no inline SVG probe');
});
