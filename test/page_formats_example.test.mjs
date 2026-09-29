/*
 * js_pdf page format gallery integration tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { latin1 } from './support/pdf-text.mjs';

test('page format gallery generates clipping controls, pagination and fitted receipts', async () => {
  const { generatePageFormatsPhase63 } = await import('../examples/page-formats-phase-6.3.mjs');
  const bytes = generatePageFormatsPhase63();
  const source = latin1(bytes);
  const boxes = [...source.matchAll(/\/MediaBox \[([^\]]*)\]/g)].map(match => match[1]);
  assert.equal(boxes.length, 8);
  assert.equal(boxes[0], boxes[1], 'clip comparison uses identical paper');
  assert.equal(boxes[3], boxes[4], 'MultiPage retains its paper');
  assert.notEqual(boxes[5], boxes[6], '57 and 80 mm receipts differ');
  assert.match(source, /\/Title \(Page clipping and formats - phase 6.3\)/);
  assert.doesNotMatch(source, /NaN|Infinity/);
});

test('page format gallery is registered in both runners after phase 6.2', () => {
  for (const path of ['../examples/Browser.html', '../examples/run-phase-examples.mjs']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /import \{ generatePageFormatsPhase63 \} from '.\/page-formats-phase-6\.3\.mjs'/);
    assert.match(source, /generatePageFormatsPhase63\(/);
    assert.ok(source.lastIndexOf('page-formats-phase-6.3') > source.lastIndexOf('pie-full-circle-phase-6.2'));
  }
});
