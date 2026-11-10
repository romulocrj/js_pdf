/*
 * js_pdf phase 7.6 widget layout and tables example tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as source from '../src/index.ts';
import { generateLayoutPhase76 } from '../examples/layout-phase-7.6.mjs';
import { latin1 } from './support/pdf-text.mjs';

test('layout phase 7.6 example produces the same PDF from source and bundled APIs', () => {
  const normalize = bytes => Buffer.from(bytes).toString('latin1').replace(/\/CreationDate \(D:\d{14}Z\)/, '/CreationDate (D:20260929000000Z)');
  const bytes = generateLayoutPhase76();
  assert.equal(normalize(bytes), normalize(generateLayoutPhase76(source)));
  const pdf = latin1(generateLayoutPhase76(source, false));
  assert.doesNotMatch(pdf, /NaN|Infinity/);
  // The fixed table keeps the word whole; the reproduced old widths split it.
  assert.equal((pdf.match(/\(ATLANTICA\) Tj/g) ?? []).length, 1);
  assert.match(pdf, /\(ATLANTI\) Tj/);
  const pages = (pdf.match(/\/Type \/Page\b/g) ?? []).length;
  assert.ok(pages >= 5, `${pages} pages`);
  assert.equal((pdf.match(/\(Category\) Tj/g) ?? []).length, pages - 1);
});
