/*
 * js_pdf image DPI gallery integration tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { latin1 } from './support/pdf-text.mjs';

const read = path => readFileSync(new URL(path, import.meta.url));

test('DPI gallery generates three pages with original/reduced JPEGs and alpha masks', async () => {
  const { generateImageDpiPhase61 } = await import('../examples/image-dpi-phase-6.1.mjs');
  const bytes = generateImageDpiPhase61({
    jpeg: new Uint8Array(read('../examples/assets/dpi-pattern.jpg')),
    png: new Uint8Array(read('../examples/assets/dpi-alpha.png'))
  });
  assert.ok(bytes instanceof Uint8Array);
  const source = latin1(bytes);
  assert.equal((source.match(/\/Type \/Page\b/g) ?? []).length, 3);
  assert.match(source, /\/Width 320 \/Height 160/);
  assert.match(source, /\/Width 144 \/Height 72/);
  assert.match(source, /\/Filter \/DCTDecode/);
  assert.match(source, /\/SMask \d+ 0 R/);
  assert.equal(source.includes('NaN'), false);
});

test('browser card uses the same generator and local assets as the phase runner', () => {
  for (const path of ['../examples/Browser.html', '../examples/run-phase-examples.mjs']) {
    const source = read(path).toString();
    assert.match(source, /import \{ generateImageDpiPhase61 \} from '.\/image-dpi-phase-6\.1\.mjs'/);
    assert.match(source, /generateImageDpiPhase61\(/);
    assert.ok(source.includes('dpi-pattern.jpg'));
    assert.ok(source.includes('dpi-alpha.png'));
  }
  assert.match(read('../examples/Browser.html').toString(), /id: 'image-dpi-phase-6\.1'/);
});
