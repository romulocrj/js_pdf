/*
 * js_pdf tests — phase 3.4 constraints and full flex.
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

function layout(widget, constraints = new Pdf.BoxConstraints({
  maxWidth: 300,
  maxHeight: 300
})) {
  return widget.layout(context(), constraints);
}


test('phase 3.4 constructors are on named, namespace and callback APIs', () => {
  for (const name of [
    'BoxConstraints', 'Flex', 'Flexible', 'Expanded', 'ConstrainedBox', 'OverflowBox'
  ]) {
    assert.equal(typeof Pdf[name], 'function', `${name} named`);
    assert.equal(Pdf.js_pdf[name], Pdf[name], `${name} namespace`);
  }

  const bytes = Pdf.createPdf({}, api => new api.Page({
    build: () => new api.Row({
      children: [new api.Expanded({ child: new api.Text('expanded callback') })]
    })
  }));
  assert.match(latin1(bytes), /\(expanded callback\) Tj/);
});

test('BoxConstraints factories and transformations preserve all four bounds', () => {
  const constraints = new Pdf.BoxConstraints({
    minWidth: 20,
    maxWidth: 100,
    minHeight: 10,
    maxHeight: 80
  });
  assert.deepEqual(constraints.smallest, { width: 20, height: 10 });
  assert.deepEqual(constraints.biggest, { width: 100, height: 80 });
  assert.deepEqual(constraints.constrain({ width: 5, height: 90 }), {
    width: 20,
    height: 80
  });
  assert.deepEqual(constraints.tighten({ width: 70 }).smallest, {
    width: 70,
    height: 10
  });
  const deflated = constraints.deflate({ horizontal: 8, vertical: 3 });
  assert.deepEqual(
    [deflated.minWidth, deflated.maxWidth, deflated.minHeight, deflated.maxHeight],
    [4, 84, 4, 74]
  );
  assert.deepEqual(Pdf.BoxConstraints.tightFor({ width: 32 }).constrain({
    width: 1,
    height: 9
  }), { width: 32, height: 9 });
});

test('SizedBox passes tight dimensions to its child', () => {
  let seen = null;
  const box = layout(new Pdf.SizedBox({
    width: 80,
    height: 30,
    child: new Pdf.LayoutBuilder({
      builder: (_context, constraints) => {
        seen = constraints;
        return new Pdf.SizedBox();
      }
    })
  }));

  assert.deepEqual([box.width, box.height], [80, 30]);
  assert.ok(seen instanceof Pdf.BoxConstraints);
  assert.deepEqual([seen.minWidth, seen.maxWidth, seen.minHeight, seen.maxHeight], [80, 80, 30, 30]);
});

test('ConstrainedBox enforces its bounds inside the parent bounds', () => {
  const box = layout(new Pdf.ConstrainedBox({
    constraints: new Pdf.BoxConstraints({ minWidth: 90, maxWidth: 140, minHeight: 35 }),
    child: new Pdf.SizedBox({ width: 20, height: 10 })
  }), new Pdf.BoxConstraints({ minWidth: 40, maxWidth: 120, maxHeight: 100 }));

  assert.deepEqual([box.width, box.height], [90, 35]);
  assert.deepEqual([box.data.childBox.width, box.data.childBox.height], [90, 35]);
});

test('Expanded distributes bounded free space by flex factor', () => {
  const box = layout(new Pdf.Row({
    children: [
      new Pdf.Expanded({ flex: 1, child: new Pdf.SizedBox({ height: 20 }) }),
      new Pdf.Expanded({ flex: 2, child: new Pdf.SizedBox({ height: 30 }) })
    ]
  }), new Pdf.BoxConstraints({ minWidth: 300, maxWidth: 300, minHeight: 100, maxHeight: 100 }));

  assert.deepEqual(box.data.children.map(child => child.box.width), [100, 200]);
  assert.deepEqual(box.data.children.map(child => child.dx), [0, 100]);
  assert.deepEqual(box.data.children.map(child => child.dy), [40, 35]);
});

test('Flexible loose may use less than its allocation', () => {
  const box = layout(new Pdf.Row({
    mainAxisAlignment: 'end',
    children: [
      new Pdf.Flexible({
        flex: 1,
        fit: 'loose',
        child: new Pdf.SizedBox({ width: 40, height: 20 })
      })
    ]
  }), new Pdf.BoxConstraints({ minWidth: 200, maxWidth: 200, maxHeight: 50 }));

  assert.equal(box.data.children[0].box.width, 40);
  assert.equal(box.data.children[0].dx, 160);
});

test('main and cross axis alignments determine pure child offsets', () => {
  const box = layout(new Pdf.Row({
    mainAxisAlignment: 'spaceBetween',
    crossAxisAlignment: 'end',
    children: [
      new Pdf.SizedBox({ width: 40, height: 10 }),
      new Pdf.SizedBox({ width: 40, height: 20 })
    ]
  }), new Pdf.BoxConstraints({ minWidth: 300, maxWidth: 300, minHeight: 100, maxHeight: 100 }));

  assert.deepEqual(box.data.children.map(child => [child.dx, child.dy]), [
    [0, 90],
    [260, 80]
  ]);
});

test('Column verticalDirection and Spacer use proportional free space', () => {
  const box = layout(new Pdf.Column({
    verticalDirection: 'up',
    children: [
      new Pdf.SizedBox({ width: 20, height: 30 }),
      new Pdf.Spacer(1),
      new Pdf.Expanded({ flex: 2, child: new Pdf.SizedBox({ width: 30 }) })
    ]
  }), new Pdf.BoxConstraints({ minWidth: 100, maxWidth: 100, minHeight: 300, maxHeight: 300 }));

  assert.deepEqual(box.data.children.map(child => child.box.height), [30, 90, 180]);
  assert.deepEqual(box.data.children.map(child => child.dy), [270, 180, 0]);
});

test('tight flex in an unbounded main axis fails clearly', () => {
  assert.throws(() => layout(new Pdf.Row({
    children: [new Pdf.Expanded({ child: new Pdf.SizedBox() })]
  }), new Pdf.BoxConstraints({ maxHeight: 100 })), /bounded main-axis/);
});

test('OverflowBox aligns an oversized child outside its own tight box', () => {
  const box = layout(new Pdf.OverflowBox({
    maxWidth: 160,
    maxHeight: 80,
    child: new Pdf.SizedBox({ width: 160, height: 80 })
  }), Pdf.BoxConstraints.tight({ width: 100, height: 50 }));

  assert.deepEqual([box.width, box.height], [100, 50]);
  assert.deepEqual([box.data.childBox.width, box.data.childBox.height], [160, 80]);
  assert.deepEqual([box.data.dx, box.data.dy], [-30, -15]);
});

test('Row keeps legacy weighted tracks and gap on top of full flex', () => {
  const box = layout(new Pdf.Row({
    widths: [1, 2],
    gap: 12,
    children: [new Pdf.Text('a'), new Pdf.Text('b')]
  }), Pdf.BoxConstraints.tight({ width: 312, height: 40 }));

  assert.deepEqual(box.data.children.map(child => child.box.width), [100, 200]);
  assert.deepEqual(box.data.children.map(child => child.dx), [0, 112]);
});

test('expanded children paint in their allocated PDF tracks', () => {
  const source = latin1(Pdf.createPdf({}, () => new Pdf.Page({
    margin: 0,
    build: () => new Pdf.SizedBox({
      width: 300,
      height: 40,
      child: new Pdf.Row({
        crossAxisAlignment: 'stretch',
        children: [
          new Pdf.Expanded({ child: new Pdf.Container({ background: '#ff0000' }) }),
          new Pdf.Expanded({ flex: 2, child: new Pdf.Container({ background: '#0000ff' }) })
        ]
      })
    })
  })));

  assert.match(source, /1 0 0 rg 0 801\.89 100 40 re f/);
  assert.match(source, /0 0 1 rg 100 801\.89 200 40 re f/);
});
