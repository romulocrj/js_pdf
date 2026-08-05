/*
 * js_pdf tests — phase 3.3 remaining basic widgets.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Tests may use Node APIs; src/ may not (enforced by tools/check-source.mjs).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import * as Pdf from '../src/index.ts';

const latin1 = bytes => {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return value;
};

function layoutOnly(widget, constraints = { maxWidth: 200, maxHeight: 100 }) {
  const document = new Pdf.Document();
  const context = {
    document,
    canvas: null,
    pageFormat: { width: 200, height: 100 },
    pageNumber: 1,
    theme: document.theme
  };
  return widget.layout(context, constraints);
}

test('phase 3.3 constructors are present on named, namespace and callback APIs', () => {
  for (const name of [
    'Transform', 'Opacity', 'FittedBox', 'AspectRatio', 'FullPage', 'Builder',
    'LayoutBuilder', 'CustomPaint', 'LimitedBox', 'VerticalDivider'
  ]) {
    assert.equal(typeof Pdf[name], 'function', `${name} named`);
    assert.equal(Pdf.js_pdf[name], Pdf[name], `${name} namespace`);
  }

  const bytes = Pdf.createPdf({}, api => new api.Page({
    build: () => new api.Builder({ builder: () => new api.Text('callback basic API') })
  }));
  assert.match(latin1(bytes), /\(callback basic API\) Tj/);
});

test('Transform rotateBox adjusts its layout bounds without mutating the child', () => {
  const child = new Pdf.SizedBox({ width: 20, height: 10 });
  const box = layoutOnly(new Pdf.Transform({ rotateBox: Math.PI / 2, child }));

  assert.ok(Math.abs(box.width - 10) < 1e-10);
  assert.ok(Math.abs(box.height - 20) < 1e-10);
  assert.equal(box.data.childBox.width, 20);
  assert.equal(box.data.childBox.height, 10);
});

test('Transform writes a scoped widget-space matrix around its alignment', () => {
  const source = latin1(Pdf.createPdf({}, () => new Pdf.Page({
    margin: 0,
    build: () => new Pdf.Transform({
      transform: [-1, 0, 0, 1, 0, 0],
      alignment: 'center',
      child: new Pdf.Container({ width: 40, height: 20, background: '#ff0000' })
    })
  })));

  assert.match(source, /q\n-1 0 0 1 40 0 cm\n/);
  assert.match(source, /1 0 0 rg 0 821\.89 40 20 re f/);
  assert.match(source, /\nQ/);
});

test('Opacity scopes a deduplicated ExtGState around its child', () => {
  const source = latin1(Pdf.createPdf({}, () => new Pdf.Page({
    build: () => new Pdf.Opacity({
      opacity: 0.4,
      child: new Pdf.Text('faded')
    })
  })));

  assert.match(source, /q\n\/g1 gs\n/);
  assert.match(source, /\/ExtGState << \/g1 << \/CA 0\.4 \/ca 0\.4 >> >>/);
  assert.match(source, /\(faded\) Tj/);
});

test('FittedBox preserves aspect ratio and clips the transformed child', () => {
  const fitted = new Pdf.FittedBox({
    fit: 'contain',
    child: new Pdf.SizedBox({ width: 200, height: 100 })
  });
  const box = layoutOnly(fitted, { maxWidth: 100, maxHeight: 100 });
  assert.deepEqual([box.width, box.height], [100, 50]);

  const painted = new Pdf.FittedBox({
    fit: 'contain',
    child: new Pdf.SizedBox({ width: 200, height: 100 })
  });
  const source = latin1(Pdf.createPdf({}, () => new Pdf.Page({
    margin: 0,
    build: () => new Pdf.SizedBox({ width: 100, height: 50, child: painted })
  })));
  assert.match(source, /re\nW n\n/);
  assert.match(source, /0\.5 0 0 0\.5/);
});

test('AspectRatio chooses the largest size that fits both maxima', () => {
  const square = layoutOnly(new Pdf.AspectRatio({ aspectRatio: 1 }), {
    maxWidth: 200,
    maxHeight: 100
  });
  assert.deepEqual([square.width, square.height], [100, 100]);

  const wide = layoutOnly(new Pdf.AspectRatio({ aspectRatio: 2 }), {
    maxWidth: 200,
    maxHeight: 60
  });
  assert.deepEqual([wide.width, wide.height], [120, 60]);
  assert.throws(() => new Pdf.AspectRatio({ aspectRatio: 0 }), /aspectRatio/);
});

test('FullPage escapes page margins when used as a background layer', () => {
  const pageTheme = new Pdf.PageTheme({
    margin: 40,
    buildBackground: () => new Pdf.FullPage({
      ignoreMargins: true,
      child: new Pdf.Container({
        width: Pdf.PageFormat.A4.width,
        height: Pdf.PageFormat.A4.height,
        background: '#00ff00'
      })
    })
  });
  const source = latin1(Pdf.createPdf({}, () => new Pdf.Page({
    pageTheme,
    build: () => new Pdf.Text('body')
  })));

  assert.match(source, /0 1 0 rg 0 0 595\.28 841\.89 re f/);
  assert.match(source, /\(body\) Tj/);
});

test('Builder and LayoutBuilder rebuild into layout data instead of widget fields', () => {
  let seenWidth = 0;
  const widget = new Pdf.LayoutBuilder({
    builder: (context, constraints) => {
      seenWidth = constraints.maxWidth;
      return new Pdf.Text(`page ${context.pageNumber}`);
    }
  });
  const box = layoutOnly(widget, { maxWidth: 123, maxHeight: 80 });
  assert.equal(seenWidth, 123);
  assert.match(box.data.childBox.widget.value, /page 1/);
});

test('CustomPaint runs background, child and foreground in that order', () => {
  const source = latin1(Pdf.createPdf({}, () => new Pdf.Page({
    margin: 0,
    build: () => new Pdf.CustomPaint({
      size: { x: 30, y: 20 },
      painter: canvas => {
        canvas.setFillColor('#ff0000');
        canvas.drawRect(0, 0, 30, 20);
        canvas.fillPath();
      },
      child: new Pdf.Text('middle'),
      foregroundPainter: canvas => {
        canvas.setStrokeColor('#0000ff');
        canvas.drawLine(0, 0, 30, 20);
        canvas.strokePath();
      }
    })
  })));

  assert.ok(source.indexOf('1 0 0 rg') < source.indexOf('(middle) Tj'));
  assert.ok(source.indexOf('(middle) Tj') < source.indexOf('0 0 1 RG'));
});

test('LimitedBox and VerticalDivider remain finite composition primitives', () => {
  const limited = layoutOnly(new Pdf.LimitedBox({
    maxWidth: 50,
    maxHeight: 40,
    child: new Pdf.SizedBox({ width: 200, height: 100 })
  }), { maxWidth: Infinity, maxHeight: Infinity });
  assert.deepEqual([limited.width, limited.height], [50, 40]);

  const divider = layoutOnly(new Pdf.VerticalDivider({ width: 12, thickness: 2 }), {
    maxWidth: 30,
    maxHeight: 80
  });
  assert.deepEqual([divider.width, divider.height], [12, 80]);
});
