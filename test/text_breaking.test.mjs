/*
 * js_pdf custom line breaking and hyphenation regressions.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as pw from '../src/index.ts';
import { latin1 } from './support/pdf-text.mjs';

const style = new pw.TextStyle({ font: pw.Font.courier(), fontSize: 10 });
function context() {
  const document = new pw.Document();
  return { document, canvas: null, pageFormat: { width: 200, height: 500 }, pageNumber: 1, theme: document.theme };
}
const measure = (widget, width = 60) => widget.layout(context(), { maxWidth: width, maxHeight: 500 });
const lines = box => box.data.lines.map(line => line.runs.map(run => run.text).join(''));
const text = (value, options = {}) => new pw.Text(value, { style, ...options });

for (const rich of [false, true]) {
  test(`${rich ? 'RichText' : 'Text'} exposes custom boundaries without adding spaces`, () => {
    const calls = [];
    const lineSplitter = line => { calls.push(line); return [...line]; };
    const value = '- abcdefgh';
    const widget = rich ? new pw.RichText({ text: new pw.TextSpan({ text: value, style }), lineSplitter }) : text(value, { lineSplitter });
    assert.deepEqual(lines(measure(widget, 48)), ['- abcdef', 'gh']);
    assert.deepEqual(calls, [value]);
    assert.deepEqual(lines(measure(text(value), 48)), ['-', 'abcdefgh']);
  });
}

test('whitespace splitter reproduces default layout and operators, including repeated spaces', () => {
  for (const value of ['a  b cdefgh ij', '  a\tb\u00a0c  ', 'one\r\ntwo\rthree\n\n', '']) {
    const lineSplitter = line => line.split(/\s/u);
    const plain = measure(text(value), 48);
    const custom = measure(text(value, { lineSplitter }), 48);
    assert.deepEqual(custom.data, plain.data);
    const save = options => pw.createPdf({ compress: false }, () => new pw.Page({ margin: 10,
      pageFormat: { width: 68, height: 300 }, build: () => text(value, options) }));
    assert.deepEqual(save({ lineSplitter }), save({}));
  }
});

test('callback sees each logical line, including blanks, once per layout', () => {
  const calls = [];
  measure(text('ab\r\n\r\ncd\ref\n', { lineSplitter: line => { calls.push(line); return [line]; } }));
  assert.deepEqual(calls, ['ab', '', 'cd', 'ef', '']);
});

test('custom token groups keep closing punctuation with the preceding character', () => {
  assert.deepEqual(lines(measure(text('abc,de', { lineSplitter: () => ['a', 'b', 'c,', 'd', 'e'] }), 18)), ['ab', 'c,d', 'e']);
});

test('custom splitters preserve supplementary characters and never mutate returned arrays', () => {
  const pieces = Object.freeze(['a', '😀', 'b']);
  const box = measure(text('a😀b', { lineSplitter: () => pieces }), 6);
  assert.equal(lines(box).join(''), 'a😀b');
  assert.deepEqual(pieces, ['a', '😀', 'b']);
});

const syllables = word => ({ abcdefghij: ['ab', 'cd', 'ef', 'gh', 'ij'], efghij: ['ef', 'gh', 'ij'] }[word] ?? [word]);
for (const rich of [false, true]) {
  test(`${rich ? 'RichText' : 'Text'} hyphenates into available space, including the hyphen width`, () => {
    const widget = rich ? new pw.RichText({ text: new pw.TextSpan({ text: 'xx abcdefghij', style }), hyphenation: syllables })
      : text('xx abcdefghij', { hyphenation: syllables });
    assert.deepEqual(lines(measure(widget, 48)), ['xx abcd-', 'efghij']);
    assert.ok(measure(widget, 48).data.lines.every(line => line.width <= 48));
  });
}

test('long words hyphenate repeatedly, callbacks cannot corrupt their cached arrays', () => {
  const parts = Object.freeze(['ab', 'cd', 'ef', 'gh', 'ij']);
  const hyphenation = word => word === 'abcdefghij' ? parts : syllables(word);
  assert.deepEqual(lines(measure(text('abcdefghij', { hyphenation }), 30)), ['abcd-', 'efgh-', 'ij']);
  assert.equal(parts.join(''), 'abcdefghij');
});

test('no available syllable falls back to moving the word or hard splitting, without hanging', () => {
  assert.deepEqual(lines(measure(text('xxx abcdef', { hyphenation: () => ['abc', 'def'] }), 36)), ['xxx', 'abcdef']);
  assert.deepEqual(lines(measure(text('abcdef', { hyphenation: () => [] }), 18)), ['abc', 'def']);
  assert.deepEqual(lines(measure(text('abcdef', { hyphenation: word => [word] }), 18)), ['abc', 'def']);
});

test('softWrap false never invokes hyphenation; maxLines limits displayed hyphenated text', () => {
  assert.deepEqual(lines(measure(text('abcdefghij', { softWrap: false, hyphenation: () => assert.fail('must not run') }), 30)), ['abcdefghij']);
  assert.deepEqual(lines(measure(text('abcdefghij', { maxLines: 1, hyphenation: syllables }), 30)), ['abcd-']);
});

test('malformed callbacks fail explicitly rather than losing text or looping', () => {
  for (const lineSplitter of [() => ['missing'], () => []]) {
    assert.throws(() => measure(text('abcdef', { lineSplitter })), /lineSplitter/i);
  }
  for (const hyphenation of [() => ['ab', 'WRONG'], () => ['', 'abcdef']]) {
    assert.throws(() => measure(text('abcdef', { hyphenation }), 18), /hyphenation/i);
  }
});

test('hyphenation survives immutable continuation and produces visible PDF hyphens', () => {
  const widget = text('xx abcdefghij\nxx abcdefghij', { hyphenation: syllables });
  const ctx = context();
  let state = widget.initialSpanState();
  const result = [];
  for (let index = 0; index < 8; index++) {
    const fragment = widget.layoutSpan(ctx, { maxWidth: 48, maxHeight: 15 }, state);
    result.push(...lines(fragment.box));
    state = fragment.nextState;
    if (!fragment.hasMore) break;
  }
  assert.deepEqual(result, ['xx abcd-', 'efghij', 'xx abcd-', 'efghij']);
  assert.deepEqual(lines(measure(widget, 48)), result);
  const bytes = pw.createPdf({ compress: false }, () => new pw.MultiPage({
    pageFormat: { width: 68, height: 35 }, margin: 10, build: () => [widget]
  }));
  assert.equal((latin1(bytes).match(/\/Type \/Page\b/g) ?? []).length, 4);
  assert.match(latin1(bytes), /\(xx abcd-\) Tj/);
});

test('custom boundaries preserve letter spacing in widths and line fitting', () => {
  const spaced = new pw.TextStyle({ font: pw.Font.courier(), fontSize: 10, letterSpacing: 2 });
  const options = { style: spaced, lineSplitter: line => [...line] };
  assert.equal(measure(text('abcd', options), 100).data.lines[0].width, 30);
  assert.deepEqual(lines(measure(text('abcd', options), 28)), ['abc', 'd']);
});

test('the direct-font option uses that font for custom boundaries and hyphenation widths', () => {
  const widget = new pw.Text('xx abcdefghij', {
    font: pw.PdfType1Font.courier(), fontSize: 10, hyphenation: syllables,
    lineSplitter: line => line.split(/\s/u)
  });
  assert.deepEqual(lines(measure(widget, 48)), ['xx abcd-', 'efghij']);
  assert.equal(measure(widget, 48).data.lines[0].width, 48);
});
