/*
 * js_pdf rich-text phase 3.7 tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as Pdf from '../src/index.ts';

function source(bytes) {
  return String.fromCharCode(...bytes);
}

function context(width = 220, height = 120) {
  const document = new Pdf.Document();
  return {
    document,
    canvas: null,
    pageFormat: { width, height },
    pageNumber: 1,
    theme: document.theme
  };
}

test('phase 3.7 constructors are on named, namespace and callback APIs', () => {
  for (const name of ['InlineSpan', 'RichText', 'TextSpan', 'WidgetSpan']) {
    assert.equal(typeof Pdf[name], 'function', name);
    assert.equal(Pdf.js_pdf[name], Pdf[name], `js_pdf.${name}`);
  }

  const bytes = Pdf.createPdf({}, api => new api.Page({
    build: () => new api.RichText({
      text: new api.TextSpan({ text: 'callback rich text' })
    })
  }));
  assert.match(source(bytes), /\(callback rich text\) Tj/);
});

test('TextSpan walks parent text before children and inherits styles', () => {
  const span = new Pdf.TextSpan({
    text: 'parent ',
    style: new Pdf.TextStyle({ fontSize: 18, color: '#ff0000' }),
    children: [
      new Pdf.TextSpan({ text: 'bold', style: new Pdf.TextStyle({ fontWeight: 'bold' }) }),
      new Pdf.TextSpan({ text: ' tail' })
    ]
  });
  assert.equal(span.toPlainText(), 'parent bold tail');

  const box = new Pdf.RichText({ text: span }).layout(context(), {
    maxWidth: 220,
    maxHeight: 120
  });
  const runs = box.data.lines.flatMap(line => line.runs).filter(run => run.kind === 'text');
  assert.deepEqual(runs.map(run => run.text), ['parent ', 'bold', ' tail']);
  assert.ok(runs.every(run => run.style.fontSize === 18));
  assert.match(runs[1].style.font.fontName, /Bold/);
});

test('justification distributes slack only when an actual gap exists', () => {
  const rich = new Pdf.RichText({
    textAlign: 'justify',
    text: new Pdf.TextSpan({ text: 'one two three four' })
  });
  const box = rich.layout(context(55), { maxWidth: 55, maxHeight: 120 });
  assert.ok(box.data.lines.length >= 2);
  assert.equal(box.data.lines[0].width, 55);
  for (const line of box.data.lines) {
    for (const run of line.runs) {
      assert.ok(Number.isFinite(run.x), `finite x for ${run.text}`);
    }
  }

  const oneWord = new Pdf.RichText({
    textAlign: 'justify',
    text: new Pdf.TextSpan({ text: 'supercalifragilistic' })
  }).layout(context(25), { maxWidth: 25, maxHeight: 200 });
  assert.ok(oneWord.data.lines.every(line => line.runs.every(run => Number.isFinite(run.x))));
});

test('per-span backgrounds and combined double decorations paint around text', () => {
  const bytes = Pdf.createPdf({}, () => new Pdf.Page({
    build: () => new Pdf.RichText({
      text: new Pdf.TextSpan({
        text: 'decorated',
        style: new Pdf.TextStyle({
          color: '#0000ff',
          background: { color: '#ffff00' },
          decoration: ['underline', 'lineThrough'],
          decorationColor: '#ff0000',
          decorationStyle: 'double',
          decorationThickness: 2
        })
      })
    })
  }));
  const pdf = source(bytes);
  assert.match(pdf, /1 1 0 rg .* re f/);
  assert.match(pdf, /0 0 1 rg .*\(decorated\) Tj/);
  assert.ok((pdf.match(/1 0 0 RG/g) ?? []).length >= 4, 'two double decoration rules');
});

test('WidgetSpan measures and paints an inline child at the shared baseline', () => {
  const widget = new Pdf.RichText({
    text: new Pdf.TextSpan({
      children: [
        new Pdf.TextSpan({ text: 'before ' }),
        new Pdf.WidgetSpan({ child: new Pdf.SizedBox({ width: 18, height: 9 }) }),
        new Pdf.TextSpan({ text: ' after' })
      ]
    })
  });
  const box = widget.layout(context(), { maxWidth: 220, maxHeight: 120 });
  const runs = box.data.lines[0].runs;
  assert.equal(runs[1].kind, 'widget');
  assert.equal(runs[1].width, 18);
  assert.equal(runs[1].height, 9);
});

test('RichText continuation is immutable and resumes at the next line', () => {
  const rich = new Pdf.RichText({
    overflow: 'span',
    text: new Pdf.TextSpan({ text: 'one two three four five six seven eight nine ten' })
  });
  const renderContext = context(70, 30);
  const initial = rich.initialSpanState();
  const first = rich.layoutSpan(renderContext, { maxWidth: 70, maxHeight: 30 }, initial);
  const second = rich.layoutSpan(renderContext, { maxWidth: 70, maxHeight: 30 }, first.nextState);

  assert.deepEqual(initial, { lineIndex: 0 });
  assert.ok(first.hasMore);
  assert.ok(first.nextState.lineIndex > 0);
  assert.ok(second.nextState.lineIndex > first.nextState.lineIndex);
  assert.notEqual(
    first.box.data.lines[0].runs[0].text,
    second.box.data.lines[0].runs[0].text
  );
});

