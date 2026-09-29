/*
 * js_pdf page clipping and upstream paper format regression tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as pw from '../src/index.ts';
import { latin1 } from './support/pdf-text.mjs';

class Probe extends pw.Widget {
  constructor(label, width = 30, height = 20) { super(); Object.assign(this, { label, width, height }); }
  layout(context, constraints) {
    return { widget: this, width: this.width, height: this.height, data: { constraints } };
  }
  paint(context, box) {
    context.canvas.push(`% ${this.label}`);
    context.canvas.fillRect(box.x - 100, box.y - 100, 300, 300, '#ff0000');
  }
}
const documentContext = () => ({ document: new pw.Document(), pageOffset: 0, pagesCount: 0 });

for (const orientation of ['natural', 'landscape']) {
  for (const multipage of [false, true]) {
    test(`${multipage ? 'MultiPage' : 'Page'} clips every layer with ${orientation} asymmetric margins`, () => {
      const theme = new pw.PageTheme({
        pageFormat: { width: 200, height: 300 }, orientation,
        margin: { left: 10, top: 20, right: 30, bottom: 40 }, clip: true,
        buildBackground: () => new Probe('background'),
        buildForeground: () => new Probe('foreground')
      });
      const section = multipage
        ? new pw.MultiPage({ pageTheme: theme, header: () => new Probe('header'), footer: () => new Probe('footer'),
          build: () => [new Probe('body'), new pw.NewPage(), new Probe('body')] })
        : new pw.Page({ pageTheme: theme, build: () => new Probe('body') });
      const context = documentContext();
      let pages = section.render(context);
      if (multipage) pages = section.postProcess({ ...context, pagesCount: pages.length });
      assert.equal(pages.length, multipage ? 2 : 1);
      const rectangle = orientation === 'natural' ? '10 40 160 240 re' : '40 30 240 160 re';
      for (const page of pages) {
        const source = latin1(page.content);
        const labels = multipage ? ['background', 'body', 'header', 'footer', 'foreground'] : ['background', 'body', 'foreground'];
        for (const label of labels) {
          assert.ok(source.includes(`q\n${rectangle}\nW n\n% ${label}\n`), `${label} must start inside a margin clip: ${source}`);
        }
        assert.equal(source.split('\n').filter(line => line === 'Q').length, labels.length);
        assert.equal(source.split('\n').filter(line => line === 'q').length, labels.length);
      }
    });
  }
}

test('clipping defaults off and copyWith can turn it off', () => {
  const theme = new pw.PageTheme({ clip: true }).copyWith({ clip: false });
  for (const pageTheme of [new pw.PageTheme(), theme]) {
    const [page] = new pw.Page({ pageTheme, build: () => new Probe('body') }).render(documentContext());
    assert.doesNotMatch(latin1(page.content), /W\*? n/);
  }
});

test('upstream finite paper sizes and margins are available without changing A4 or Letter', () => {
  for (const [name, width, height, margin] of [
    ['A3', 29.7 * pw.PageUnit.cm, 42 * pw.PageUnit.cm, 2 * pw.PageUnit.cm],
    ['A4', 595.28, 841.89, 2 * pw.PageUnit.cm],
    ['A5', 14.8 * pw.PageUnit.cm, 21 * pw.PageUnit.cm, 2 * pw.PageUnit.cm],
    ['A6', 105 * pw.PageUnit.mm, 148 * pw.PageUnit.mm, pw.PageUnit.cm],
    ['LETTER', 612, 792, 72], ['LEGAL', 612, 1008, 72]
  ]) {
    const format = pw.PageFormat[name];
    assert.ok(format, name);
    assert.ok(Math.abs(format.width - width) < 1e-10);
    assert.ok(Math.abs(format.height - height) < 1e-10);
    assert.deepEqual(new pw.PageTheme({ pageFormat: format }).margin, { left: margin, top: margin, right: margin, bottom: margin });
    assert.ok(Object.isFrozen(format));
    const pdf = pw.createPdf({ compress: false }, () => new pw.Page({ pageFormat: format, build: () => new Probe('body') }));
    assert.doesNotMatch(latin1(pdf), /NaN|Infinity/);
  }
  assert.equal(pw.PageFormat.STANDARD, pw.PageFormat.A4);
  assert.equal(pw.PageUnit.dp, 72 / 150);
});

for (const name of ['ROLL57', 'ROLL80', 'UNDEFINED']) {
  test(`${name} Page resolves unbounded dimensions from content before painting`, () => {
    assert.ok(pw.PageFormat[name], name);
    const format = pw.PageFormat[name];
    const margin = name === 'UNDEFINED' ? 0 : 5 * pw.PageUnit.mm;
    const seen = [];
    class Measured extends Probe {
      paint(context, box) {
        seen.push(context.pageFormat);
        assert.equal(context.canvas.pageHeight, context.pageFormat.height);
        assert.equal(box.y, margin);
        super.paint(context, box);
      }
    }
    const section = new pw.Page({ pageTheme: new pw.PageTheme({ pageFormat: format, clip: true,
      buildBackground: context => { assert.ok(Number.isFinite(context.pageFormat.height)); return new Probe('background'); } }),
      build: () => new Measured('body', 90, 120) });
    const [page] = section.render(documentContext());
    assert.equal(page.format.width, name === 'UNDEFINED' ? 90 : format.width);
    assert.ok(Math.abs(page.format.height - (120 + 2 * margin)) < 1e-10);
    assert.equal(seen.length, 1);
    assert.doesNotMatch(latin1(page.content), /NaN|Infinity/);
    assert.equal(section.format.height, Infinity, 'rendering must not mutate the declared format');
    const pdf = new pw.Document({ compress: false });
    pdf.addPage(section);
    assert.doesNotMatch(latin1(pdf.save()), /NaN|Infinity/);
    assert.deepEqual(pdf.save(), pdf.save());
  });
}

test('an unbounded axis resolves after orientation, with rotated margins', () => {
  const [page] = new pw.Page({ pageFormat: { width: 100, height: Infinity }, orientation: 'landscape',
    margin: { left: 1, top: 2, right: 3, bottom: 4 }, build: () => new Probe('body', 50, 20)
  }).render(documentContext());
  assert.equal(page.format.width, 56);
  assert.equal(page.format.height, 100);
});

test('MultiPage rejects unbounded paper dimensions before building content', () => {
  for (const format of [{ width: 100, height: Infinity }, { width: Infinity, height: 100 }]) {
    assert.throws(() => new pw.MultiPage({ pageFormat: format, build: () => { assert.fail('must validate first'); } }).render(documentContext()), /finite/i);
  }
});

test('invalid paper and non-finite measured content fail before serialization', () => {
  for (const width of [0, -1, NaN, -Infinity]) {
    assert.throws(() => new pw.Page({ pageFormat: { width, height: 100 }, build: () => new Probe('body') }).render(documentContext()), /positive/i);
  }
  assert.throws(() => new pw.Page({ pageFormat: { width: 100, height: Infinity }, margin: 0,
    build: () => new Probe('body', 30, Infinity) }).render(documentContext()), /finite/i);
});

for (const moveIntact of [false, true]) {
  test(`MultiPage clips ${moveIntact ? 'a spanning child moved intact' : 'every split fragment'}`, () => {
    const column = new pw.Column({ mainAxisSize: 'min', children: moveIntact
      ? [new Probe('column', 30, 60)]
      : [new Probe('first', 30, 60), new Probe('second', 30, 60)] });
    const section = new pw.MultiPage({
      pageTheme: new pw.PageTheme({ pageFormat: { width: 200, height: 100 }, margin: 10, clip: true }),
      gap: 0, build: () => moveIntact ? [new Probe('before', 30, 50), column] : [column]
    });
    const context = documentContext();
    section.render(context);
    const pages = section.postProcess({ ...context, pagesCount: 2 });
    assert.equal(pages.length, 2);
    for (const page of pages) {
      const source = latin1(page.content);
      assert.match(source, /^q\n10 10 180 80 re\nW n\n/);
      assert.match(source.trimEnd(), /\nQ$/);
      assert.equal((source.match(/W n/g) ?? []).length, 1);
    }
  });
}
