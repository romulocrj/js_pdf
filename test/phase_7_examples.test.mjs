/*
 * js_pdf phase 6.9 and phase 7 gallery registration checks.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ids = ['api-phase-6.12', 'serialization-phase-7.1', 'fonts-phase-7.2', 'text-bidi-phase-7.3', 'svg-phase-7.4',
  'graphics-phase-7.5', 'layout-phase-7.6'];

test('phase 6.9 sits between phases 6.8 and 6.10 in both catalogs', () => {
  for (const file of ['Browser.html', 'run-phase-examples.mjs']) {
    const value = readFileSync(new URL('../examples/' + file, import.meta.url), 'utf8');
    assert.ok(value.includes("from './directional-layout-phase-6.9.mjs'"), file);
    const at = id => value.lastIndexOf(id);
    assert.ok(at('fonts-phase-6.8') < at('directional-layout-phase-6.9'), file);
    assert.ok(at('directional-layout-phase-6.9') < at('objects-phase-6.10'), file);
  }
});

test('phase 7 examples follow phase 6.12 in numeric order in both catalogs', () => {
  for (const file of ['Browser.html', 'run-phase-examples.mjs']) {
    const value = readFileSync(new URL('../examples/' + file, import.meta.url), 'utf8');
    for (const id of ids.slice(1)) {
      const module = id + '.mjs';
      assert.ok(value.includes(`from './${module}'`), `${file} imports ${module}`);
    }
    for (let i = 1; i < ids.length; i++) {
      assert.ok(value.lastIndexOf(ids[i]) > value.lastIndexOf(ids[i - 1]), `${file}: ${ids[i]} after ${ids[i - 1]}`);
    }
  }
});
