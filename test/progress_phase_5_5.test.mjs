/*
 * js_pdf progress phase 5.5 tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as Pdf from '../src/index.ts';
import { PdfCanvas } from '../src/pdf/graphics.ts';

function latin1(bytes) {
  let result = '';
  for (const byte of bytes) result += String.fromCharCode(byte);
  return result;
}

function render(widget, box, pageHeight = 200) {
  const canvas = new PdfCanvas(pageHeight);
  widget.paint({ canvas }, { widget, data: null, ...box });
  return canvas.output().trim();
}

test('phase 5.5 progress APIs are named, namespaced and callback-visible', () => {
  let callbackApi = null;
  for (const name of ['CircularProgressIndicator', 'LinearProgressIndicator']) {
    assert.equal(typeof Pdf[name], 'function', name);
    assert.equal(Pdf.js_pdf[name], Pdf[name], `js_pdf.${name}`);
  }

  const source = latin1(Pdf.createPdf({}, api => {
    callbackApi = api;
    return new api.Page({
      margin: 20,
      build: () => new api.Column({
        crossAxisAlignment: 'stretch',
        children: [
          new api.SizedBox({
            width: 30,
            height: 30,
            child: new api.CircularProgressIndicator({ value: 0.4 })
          }),
          new api.LinearProgressIndicator({ value: 0.6 })
        ]
      })
    });
  }));

  for (const name of ['CircularProgressIndicator', 'LinearProgressIndicator']) {
    assert.equal(callbackApi[name], Pdf[name], `callback ${name}`);
  }
  assert.match(source, /0\.2471 0\.3176 0\.7098 rg/);
  assert.match(source, /0\.1294 0\.5882 0\.9529 rg/);
});

test('progress layout follows the upstream biggest and enforced-smallest rules', () => {
  const circular = new Pdf.CircularProgressIndicator({ value: 0.25 });
  const circleBox = circular.layout({}, {
    minWidth: 10,
    maxWidth: 48,
    minHeight: 12,
    maxHeight: 36
  });
  assert.deepEqual([circleBox.width, circleBox.height], [48, 36]);

  const linear = new Pdf.LinearProgressIndicator({ value: 0.25 });
  const lineBox = linear.layout({}, { maxWidth: 120, maxHeight: 50 });
  assert.deepEqual([lineBox.width, lineBox.height], [120, 4]);

  const tall = new Pdf.LinearProgressIndicator({ value: 0.25, minHeight: 9 });
  const tallBox = tall.layout({}, { minWidth: 20, maxWidth: 80, minHeight: 12, maxHeight: 30 });
  assert.deepEqual([tallBox.width, tallBox.height], [80, 12]);
});

test('CircularProgressIndicator paints foreground and optional remainder as ring sectors', () => {
  const widget = new Pdf.CircularProgressIndicator({
    value: 0.25,
    color: '#ff0000',
    backgroundColor: '#cccccc',
    strokeWidth: 4
  });
  const output = render(widget, { x: 10, y: 20, width: 40, height: 40 });

  assert.match(output, /^30 180 m/);
  assert.match(output, /0\.8 0\.8 0\.8 rg\nf/);
  assert.match(output, /1 0 0 rg\nf$/);
  assert.equal(output.split('\n').filter(line => line === 'f').length, 2);
});

test('CircularProgressIndicator preserves upstream value clamping and endpoint visibility', () => {
  const empty = new Pdf.CircularProgressIndicator({ value: -2, backgroundColor: '#cccccc' });
  const emptyOutput = render(empty, { x: 0, y: 0, width: 30, height: 30 });
  assert.equal(emptyOutput.split('\n').filter(line => line === 'f').length, 1);
  assert.doesNotMatch(emptyOutput, /0\.2471 0\.3176 0\.7098 rg/);

  const full = new Pdf.CircularProgressIndicator({ value: 2, backgroundColor: '#cccccc' });
  const fullOutput = render(full, { x: 0, y: 0, width: 30, height: 30 });
  assert.equal(fullOutput.split('\n').filter(line => line === 'f').length, 1);
  assert.doesNotMatch(fullOutput, /0\.8 0\.8 0\.8 rg/);
  assert.match(fullOutput, /0\.2471 0\.3176 0\.7098 rg/);
});

test('LinearProgressIndicator paints the exact foreground and default shaded remainder', () => {
  const widget = new Pdf.LinearProgressIndicator({ value: 0.25 });
  const output = render(widget, { x: 10, y: 20, width: 100, height: 8 });

  assert.match(output, /^34\.99 172 75\.01 8 re/);
  assert.match(output, /0\.5402 0\.7825 0\.9751 rg\nf/);
  assert.match(output, /10 172 25 8 re\n0\.1294 0\.5882 0\.9529 rg\nf$/);
});

test('LinearProgressIndicator clamps values and accepts explicit colors and height', () => {
  const empty = new Pdf.LinearProgressIndicator({
    value: -1,
    valueColor: '#000000',
    backgroundColor: '#ffffff',
    minHeight: 6
  });
  assert.equal(
    render(empty, { x: 5, y: 7, width: 80, height: 6 }),
    '5 187 80 6 re\n1 1 1 rg\nf'
  );

  const full = new Pdf.LinearProgressIndicator({ value: 3, valueColor: '#00ff00' });
  assert.equal(
    render(full, { x: 5, y: 7, width: 80, height: 6 }),
    '5 187 80 6 re\n0 1 0 rg\nf'
  );
});

test('progress constructors reject non-finite values and negative dimensions', () => {
  assert.throws(
    () => new Pdf.CircularProgressIndicator({ value: Number.NaN }),
    /value must be a finite number/
  );
  assert.throws(
    () => new Pdf.CircularProgressIndicator({ value: 0.5, strokeWidth: -1 }),
    /strokeWidth must be non-negative/
  );
  assert.throws(
    () => new Pdf.LinearProgressIndicator({ value: Infinity }),
    /value must be a finite number/
  );
  assert.throws(
    () => new Pdf.LinearProgressIndicator({ value: 0.5, minHeight: -1 }),
    /minHeight must be non-negative/
  );
});
