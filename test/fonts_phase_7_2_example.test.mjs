/*
 * js_pdf phase 7.2 font fixes example integration tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as source from '../src/index.ts';
import { generateFontsPhase72 } from '../examples/fonts-phase-7.2.mjs';
import { latin1 } from './support/pdf-text.mjs';

const asset = name => new Uint8Array(readFileSync(new URL(`../examples/assets/${name}`, import.meta.url)));
const fonts = {
  openSans: asset('OpenSans-Regular.ttf'),
  cjk: asset('JsPdfCjkExample.ttf'),
  icons: asset('MaterialIcons.ttf')
};

test('font fixes example produces the same PDF from source and bundled APIs', () => {
  const normalize = bytes => Buffer.from(bytes).toString('latin1').replace(/\/CreationDate \(D:\d{14}Z\)/, '/CreationDate (D:20261110000000Z)');
  assert.equal(normalize(generateFontsPhase72(fonts)), normalize(generateFontsPhase72(fonts, source)));

  const pdf = latin1(generateFontsPhase72(fonts, source, false));
  assert.ok(/<[0-9A-F]{4}> <DBFFDFFD>/.test(pdf), 'U+10FFFD maps to a surrogate pair');
  const sections = [...pdf.matchAll(/(\d+) beginbfchar/g)].map(([, count]) => Number(count));
  assert.ok(sections.includes(100), 'a font with more than 100 characters is sectioned');
  assert.ok(sections.every(count => count <= 100), `sections ${sections}`);
  assert.ok(/\(\\223Quotes\\224/.test(pdf), 'curly quotes stay in Helvetica');
  assert.ok(!/NaN|Infinity/.test(pdf));
});
