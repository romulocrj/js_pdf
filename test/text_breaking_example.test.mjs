/*
 * js_pdf line-breaking gallery integration tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as pw from '../src/index.ts';
import { latin1 } from './support/pdf-text.mjs';
const fontBytes = () => new Uint8Array(readFileSync(new URL('../examples/assets/JsPdfCjkExample.ttf', import.meta.url)));

test('real CJK glyphs fill space after a prefix and grouped punctuation stays attached', () => {
  const font = pw.Font.ttf(fontBytes());
  const document = new pw.Document();
  const context = { document, canvas: null, pageFormat: { width: 200, height: 200 }, pageNumber: 1, theme: document.theme };
  const measure = (value, lineSplitter, width) => new pw.Text(value, {
    style: new pw.TextStyle({ font, fontSize: 10 }), lineSplitter
  }).layout(context, { maxWidth: width, maxHeight: 200 }).data.lines.map(line => line.runs.map(run => run.text).join(''));
  const value = '- 字体排印学是研究字体';
  assert.equal(measure(value, null, 100)[0], '-');
  assert.match(measure(value, line => [...line], 100)[0], /^- 字体排印/);
  assert.deepEqual(measure('你好，世界', () => ['你', '好，', '世', '界'], 20), ['你', '好，', '世界']);
});

test('line-breaking gallery embeds CJK font and generates its comparison page', async () => {
  const { generateTextBreakingPhase64 } = await import('../examples/text-breaking-phase-6.4.mjs');
  const source = latin1(generateTextBreakingPhase64(fontBytes()));
  assert.equal((source.match(/\/Type \/Page\b/g) ?? []).length, 1);
  assert.match(source, /\/FontFile2/);
  assert.match(source, /\/ToUnicode/);
  assert.match(source, /\/Title \(Text breaking - phase 6.4\)/);
  assert.doesNotMatch(source, /NaN|Infinity/);
});

test('line-breaking example is registered in both runners after phase 6.3', () => {
  for (const path of ['../examples/Browser.html', '../examples/run-phase-examples.mjs']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /import \{ generateTextBreakingPhase64 \} from '.\/text-breaking-phase-6\.4\.mjs'/);
    assert.match(source, /generateTextBreakingPhase64\(/);
    assert.match(source, /JsPdfCjkExample\.ttf/);
    assert.ok(source.lastIndexOf('text-breaking-phase-6.4') > source.lastIndexOf('page-formats-phase-6.3'));
  }
});
