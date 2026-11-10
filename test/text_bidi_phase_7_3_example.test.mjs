/*
 * js_pdf phase 7.3 text, bidi and Arabic example integration tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as source from '../src/index.ts';
import { generateTextBidiPhase73 } from '../examples/text-bidi-phase-7.3.mjs';
import { latin1 } from './support/pdf-text.mjs';

const font = () => new Uint8Array(readFileSync(new URL('../examples/assets/JsPdfArabicExample.ttf', import.meta.url)));

test('text and bidi gallery produces the same PDF from source and bundled APIs', () => {
  const normalize = bytes => Buffer.from(bytes).toString('latin1').replace(/\/CreationDate \(D:\d{14}Z\)/, '/CreationDate (D:20261110000000Z)');
  const bytes = generateTextBidiPhase73(undefined, true, font());
  assert.equal(normalize(bytes), normalize(generateTextBidiPhase73(source, true, font())));
  const pdf = latin1(generateTextBidiPhase73(source, false, font()));
  assert.equal((pdf.match(/\/Type \/Page\b/g) ?? []).length, 1);
  assert.match(pdf, /\/Title \(Text layout, bidi and Arabic - phase 7\.3\)/);
  assert.match(pdf, /\/BaseFont \/JsPdfArabicExample/);
  assert.match(pdf, /\(Bundes-\) Tj/);
  assert.match(pdf, /\(Tab: A B\) Tj/);
  const operators = pdf.split('\n').filter(line => / (Tj|Tm|re|cm)\b/.test(line)).join('\n');
  assert.doesNotMatch(operators, /\xad|NaN|Infinity/);
});

test('the gallery needs the Arabic example font', () => {
  assert.throws(() => generateTextBidiPhase73(source), /JsPdfArabicExample\.ttf/);
});
