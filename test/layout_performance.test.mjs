/*
 * js_pdf allocation and text fast-path regression tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as pw from '../src/index.ts';
const context = () => { const document = new pw.Document(); return { document, theme: document.theme, canvas: null, pageNumber: 1 }; };

test('enforce reuses unchanged constraints, but preserves every clamped value', () => {
  for (const values of [{}, { minWidth: 10, maxWidth: 100, minHeight: 5, maxHeight: 50 }, { minWidth: Infinity, maxWidth: Infinity }]) {
    const original = new pw.BoxConstraints(values);
    assert.equal(original.enforce(new pw.BoxConstraints()), original);
  }
  for (const value of [0, -0, 2, 30, Infinity]) {
    const original = new pw.BoxConstraints({ minWidth: value, maxWidth: value, minHeight: value, maxHeight: value });
    const bound = new pw.BoxConstraints({ maxWidth: 20, maxHeight: 40 });
    const result = original.enforce(bound);
    for (const name of ['minWidth', 'maxWidth', 'minHeight', 'maxHeight']) {
      const max = name.endsWith('Width') ? 20 : 40;
      assert.ok(Object.is(result[name], Math.min(max, Math.max(0, value))));
    }
    assert.ok(Object.is(original.minWidth, value));
  }
});

test('Flex continuation avoids copying children and keeps alignment and repeated layout stable', () => {
  let copies = 0;
  const children = Array.from({ length: 6 }, (_, i) => new pw.SizedBox({ width: 10 + i, height: 10 }));
  children.slice = (...args) => { copies++; return Array.prototype.slice.apply(children, args); };
  const column = new pw.Column({ children, gap: 2, mainAxisSize: 'min', crossAxisAlignment: 'end', verticalDirection: 'up' });
  const ctx = context();
  const constraints = new pw.BoxConstraints({ maxWidth: 100, maxHeight: 25 });
  const first = column.layoutSpan(ctx, constraints, { firstChild: 0 });
  const next = column.layoutSpan(ctx, constraints, first.nextState);
  assert.deepEqual(first.nextState, { firstChild: 2 });
  assert.deepEqual(next.nextState, { firstChild: 4 });
  assert.deepEqual(next.box.data.children.map(c => [c.box.widget, c.dx, c.dy]), [[children[2], 1, 12], [children[3], 0, 0]]);
  assert.deepEqual(column.layoutSpan(ctx, constraints, { firstChild: 0 }), first);
  assert.equal(copies, 0, 'continuation must index the retained children instead of copying sublists');
});

test('printable ASCII single words skip splits without bypassing custom callbacks', () => {
  const value = 'TICKET-0123456789';
  const split = String.prototype.split;
  let splits = 0;
  String.prototype.split = function (...args) { if (String(this) === value) splits++; return split.apply(this, args); };
  try {
    const plain = new pw.Text(value).layout(context(), { maxWidth: 55, maxHeight: 500 });
    assert.equal(splits, 0);
    let calls = 0;
    const custom = new pw.Text(value, { lineSplitter: line => { calls++; return [line]; } }).layout(context(), { maxWidth: 55, maxHeight: 500 });
    assert.equal(calls, 1);
    assert.deepEqual(custom.data, plain.data);
  } finally { String.prototype.split = split; }
});

test('Unicode whitespace and explicit line breaks retain the full splitting path', () => {
  for (const value of ['a b', 'a\tb', 'a\u00a0b', 'a\u2003b', 'a\r\nb', 'a\nb', '', '😀abc', '你好']) {
    const constraints = { maxWidth: 18, maxHeight: 500 };
    const plain = new pw.Text(value).layout(context(), constraints);
    const custom = new pw.Text(value, { lineSplitter: line => line.split(/\s/u) }).layout(context(), constraints);
    assert.deepEqual(custom.data, plain.data, JSON.stringify(value));
  }
});
