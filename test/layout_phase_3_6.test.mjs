/*
 * js_pdf tests — phase 3.6 stack, wrap, grid and partitions.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Tests may use Node APIs; src/ may not (enforced by tools/check-source.mjs).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import * as Pdf from '../src/index.ts';
import { latin1 } from "./support/pdf-text.mjs";

function context(width = 300, height = 300) {
  const document = new Pdf.Document();
  return {
    document,
    canvas: null,
    pageFormat: { width, height },
    pageNumber: 1,
    theme: document.theme
  };
}


test('phase 3.6 constructors are on named, namespace and callback APIs', () => {
  for (const name of [
    'Stack', 'Positioned', 'PositionedDirectional', 'Wrap',
    'GridView', 'Partition', 'Partitions'
  ]) {
    assert.equal(typeof Pdf[name], 'function', `${name} named`);
    assert.equal(Pdf.js_pdf[name], Pdf[name], `${name} namespace`);
  }

  const source = latin1(Pdf.createPdf({}, api => new api.Page({
    margin: 0,
    build: () => new api.Stack({
      children: [new api.Positioned({ left: 4, top: 5, child: new api.Text('stacked') })]
    })
  })));
  assert.match(source, /\(stacked\) Tj/);
});

test('EdgeInsets is constructible without losing its factory shapes', () => {
  assert.deepEqual(new Pdf.EdgeInsets({ all: 4, left: 9 }), {
    top: 4,
    right: 4,
    bottom: 4,
    left: 9
  });
  assert.deepEqual(Pdf.EdgeInsets.symmetric({ vertical: 2, horizontal: 3 }), {
    top: 2,
    right: 3,
    bottom: 2,
    left: 3
  });
});

test('Stack aligns normal children and resolves every positioned edge', () => {
  const stack = new Pdf.Stack({
    alignment: 'center',
    fit: 'loose',
    children: [
      new Pdf.SizedBox({ width: 20, height: 10 }),
      new Pdf.Positioned({ left: 8, top: 9, width: 30, height: 12, child: new Pdf.SizedBox() }),
      new Pdf.Positioned({ right: 7, bottom: 6, child: new Pdf.SizedBox({ width: 15, height: 11 }) }),
      Pdf.Positioned.fill({ left: 10, top: 20, right: 30, bottom: 40, child: new Pdf.SizedBox() })
    ]
  });
  const box = stack.layout(context(), Pdf.BoxConstraints.tight({ width: 100, height: 80 }));

  assert.deepEqual(box.data.children.map(child => [child.dx, child.dy, child.box.width, child.box.height]), [
    [40, 35, 20, 10],
    [8, 9, 30, 12],
    [78, 63, 15, 11],
    [10, 20, 60, 20]
  ]);
});

test('Stack clipping scopes an overflow path around painted children', () => {
  const source = latin1(Pdf.createPdf({}, () => new Pdf.Page({
    margin: 0,
    build: () => new Pdf.SizedBox({
      width: 50,
      height: 30,
      child: new Pdf.Stack({
        overflow: 'clip',
        children: [new Pdf.Positioned({ left: -10, top: -5, child: new Pdf.Container({ width: 80, height: 50, background: '#ff0000' }) })]
      })
    })
  })));
  assert.match(source, /q\n0 811\.89 50 30 re\nW n/);
  assert.match(source, /Q/);
});

test('GridView divides its cross axis and fills finite main-axis runs', () => {
  const grid = new Pdf.GridView({
    crossAxisCount: 3,
    crossAxisSpacing: 6,
    mainAxisSpacing: 4,
    children: Array.from({ length: 6 }, () => new Pdf.SizedBox())
  });
  const box = grid.layout(context(), Pdf.BoxConstraints.tight({ width: 300, height: 104 }));

  assert.equal(box.data.childCrossAxis, 96);
  assert.equal(box.data.childMainAxis, 50);
  assert.deepEqual(box.data.children.map(child => [child.dx, child.dy]), [
    [0, 0], [102, 0], [204, 0], [0, 54], [102, 54], [204, 54]
  ]);
});

test('GridView continuation stops exactly when all children are consumed', () => {
  const grid = new Pdf.GridView({
    crossAxisCount: 2,
    childAspectRatio: 0.5,
    children: Array.from({ length: 7 }, (_, index) => new Pdf.Text(String(index)))
  });
  const constraints = new Pdf.BoxConstraints({ maxWidth: 100, maxHeight: 50 });
  const first = grid.layoutSpan(context(), constraints, grid.initialSpanState());
  const second = grid.layoutSpan(context(), constraints, first.nextState);

  assert.deepEqual([first.box.data.firstChild, first.box.data.lastChild, first.hasMore], [0, 4, true]);
  assert.deepEqual([second.box.data.firstChild, second.box.data.lastChild, second.hasMore], [4, 7, false]);
});

test('Wrap creates runs and applies within-run cross alignment', () => {
  const wrap = new Pdf.Wrap({
    spacing: 5,
    runSpacing: 7,
    crossAxisAlignment: 'center',
    children: [
      new Pdf.SizedBox({ width: 40, height: 10 }),
      new Pdf.SizedBox({ width: 50, height: 20 }),
      new Pdf.SizedBox({ width: 60, height: 30 })
    ]
  });
  const box = wrap.layout(context(), new Pdf.BoxConstraints({ maxWidth: 100, maxHeight: 100 }));

  assert.equal(box.data.runCount, 2);
  assert.deepEqual(box.data.children.map(child => [child.dx, child.dy]), [
    [0, 5], [45, 0], [0, 27]
  ]);
  assert.deepEqual([box.width, box.height], [95, 57]);
});

test('Wrap continuation advances at full-run boundaries', () => {
  const wrap = new Pdf.Wrap({
    spacing: 5,
    runSpacing: 5,
    children: Array.from({ length: 6 }, () => new Pdf.SizedBox({ width: 45, height: 20 }))
  });
  const constraints = new Pdf.BoxConstraints({ maxWidth: 100, maxHeight: 25 });
  const first = wrap.layoutSpan(context(), constraints, wrap.initialSpanState());
  const second = wrap.layoutSpan(context(), constraints, first.nextState);

  assert.deepEqual([first.box.data.firstChild, first.box.data.lastChild], [0, 2]);
  assert.deepEqual([second.box.data.firstChild, second.box.data.lastChild], [2, 4]);
});

test('Partitions combine fixed and flex columns at their allocated widths', () => {
  const partitions = new Pdf.Partitions({
    children: [
      new Pdf.Partition({ width: 80, child: new Pdf.Container({ height: 20 }) }),
      new Pdf.Partition({ flex: 1, child: new Pdf.Container({ height: 30 }) }),
      new Pdf.Partition({ flex: 2, child: new Pdf.Container({ height: 40 }) })
    ]
  });
  const box = partitions.layout(context(), new Pdf.BoxConstraints({ maxWidth: 320, maxHeight: 100 }));

  assert.deepEqual(box.data.children.map(child => [child.dx, child.box.width]), [
    [0, 80], [80, 80], [160, 160]
  ]);
  assert.deepEqual([box.width, box.height], [320, 40]);
});

test('Partitions continue while any column still has grid content', () => {
  const left = new Pdf.GridView({
    crossAxisCount: 1,
    childAspectRatio: 0.5,
    children: [new Pdf.Text('a'), new Pdf.Text('b')]
  });
  const right = new Pdf.GridView({
    crossAxisCount: 1,
    childAspectRatio: 0.5,
    children: [new Pdf.Text('1'), new Pdf.Text('2'), new Pdf.Text('3'), new Pdf.Text('4')]
  });
  const partitions = new Pdf.Partitions({
    children: [new Pdf.Partition({ child: left }), new Pdf.Partition({ child: right })]
  });
  const constraints = new Pdf.BoxConstraints({ maxWidth: 200, maxHeight: 50 });
  const first = partitions.layoutSpan(context(), constraints, partitions.initialSpanState());
  const second = partitions.layoutSpan(context(), constraints, first.nextState);
  const third = partitions.layoutSpan(context(), constraints, second.nextState);
  const fourth = partitions.layoutSpan(context(), constraints, third.nextState);

  assert.equal(first.hasMore, true);
  assert.equal(second.hasMore, true);
  assert.equal(third.hasMore, true);
  assert.equal(fourth.hasMore, false);
  assert.equal(third.box.data.children[0].box.data.childBox, null);
  assert.ok(third.box.data.children[1].box.data.childBox);
});
