/*
 * js_pdf full-circle pie rounding regressions.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Pdf from '../src/index.ts';
import { PdfCanvas } from '../src/pdf/graphics.ts';
import { latin1 } from './support/pdf-text.mjs';

function slice(angle, innerRadius, start = 0) {
  const document = new Pdf.Document();
  const canvas = new PdfCanvas(240);
  const context = { document, canvas, pageFormat: { width: 240, height: 240 }, pageNumber: 1, theme: document.theme };
  const dataset = new Pdf.PieDataSet({ value: 75, innerRadius, offset: 12, drawBorder: true, legend: 'Full', legendPosition: 'outside' });
  const frame = new Pdf.PieFrame(60, start, start + angle, 120, 120, 120);
  const layout = dataset.layout(context, frame);
  dataset.paintBackground(context, frame, layout);
  dataset.paint(context, frame, layout);
  return { layout, operators: canvas.output() };
}

for (const innerRadius of [0, 25]) {
  test(`rounded full circle matches exact layout and PDF paths (inner radius ${innerRadius})`, () => {
    for (const start of [0, 0.7]) {
      const exact = slice(Math.PI * 2, innerRadius, start);
      for (const deficit of [Number.EPSILON * 4, 5e-13]) {
        const rounded = slice(Math.PI * 2 - deficit, innerRadius, start);
        assert.equal(rounded.operators, exact.operators);
        for (const key of ['boxWidth', 'boxHeight', 'legendLeft', 'legendBottom', 'anchor', 'pivot', 'start']) {
          assert.deepEqual(rounded.layout[key], exact.layout[key], key);
        }
      }
      const partial = slice(Math.PI * 2 - 1e-6, innerRadius, start);
      assert.notEqual(partial.operators, exact.operators);
      assert.notDeepEqual(partial.layout.anchor, exact.layout.anchor);
    }
  });
}

test('single value 75 renders the same full circle as value 1 through Chart/PieGrid', () => {
  const render = value => latin1(Pdf.createPdf({ compress: false }, () => new Pdf.Page({
    build: () => new Pdf.Chart({ grid: new Pdf.PieGrid(), datasets: [
      new Pdf.PieDataSet({ value, color: '#2563eb', drawBorder: true, offset: 12 })
    ] })
  }))).replace(/\/CreationDate \([^)]*\)/g, '');
  assert.ok(75 * (Math.PI / 75 * 2) < Math.PI * 2, 'fixture exercises actual rounding');
  assert.equal(render(75), render(1));
});
