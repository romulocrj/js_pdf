/*
 * js_pdf combined phases 6.8, 6.10 and 6.12 gallery checks.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as api from '../src/index.ts';
import { generateFontsPhase68, generateObjectsPhase610, generateApiPhase612 } from '../examples/fonts-objects-api-phases.mjs';
const bytes = name => new Uint8Array(readFileSync(new URL('../examples/assets/' + name, import.meta.url)));
const fonts = { ttf: bytes('OpenSans-Regular.ttf'), cff: bytes('JsPdfCffExample.otf'), cid: bytes('JsPdfCffCidExample.otf') };
const normalize = bytes => Buffer.from(bytes).toString('latin1').replace(/\/CreationDate \(D:\d{14}Z\)/, '/CreationDate (D:20260929000000Z)');
test('all three proofs match source and bundled APIs', () => {
 for (const [bundled, source] of [[generateFontsPhase68(fonts), generateFontsPhase68(fonts, api)], [generateObjectsPhase610(),generateObjectsPhase610(api)], [generateApiPhase612(),generateApiPhase612(api)]]) assert.equal(normalize(bundled),normalize(source));
});
test('combined PR examples are ordered 6.8, 6.10, 6.12 in both catalogs', () => {
 for (const file of ['Browser.html','run-phase-examples.mjs']) {
  const value = readFileSync(new URL('../examples/'+file, import.meta.url),'utf8');
  const ids = ['colors-phase-6.7','fonts-phase-6.8','objects-phase-6.10','api-phase-6.12'];
  for (let i=1;i<ids.length;i++) assert.ok(value.lastIndexOf(ids[i]) > value.lastIndexOf(ids[i-1]));
 }
});
