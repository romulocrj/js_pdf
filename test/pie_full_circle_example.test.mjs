/*
 * js_pdf pie full-circle gallery tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { latin1 } from './support/pdf-text.mjs';

test('full-circle gallery generates a page with exact, rounded and partial charts', async () => {
  const { generatePieFullCirclePhase62 } = await import('../examples/pie-full-circle-phase-6.2.mjs');
  const bytes = generatePieFullCirclePhase62();
  const source = latin1(bytes);
  assert.equal((source.match(/\/Type \/Page\b/g) ?? []).length, 1);
  assert.match(source, /\/Title \(Pie full circles - phase 6.2\)/);
  assert.equal(source.includes('NaN'), false);
  assert.ok(bytes.length > 1000);
});

test('full-circle gallery is registered in the browser and phase runner', () => {
  for (const path of ['../examples/Browser.html', '../examples/run-phase-examples.mjs']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /import \{ generatePieFullCirclePhase62 \} from '.\/pie-full-circle-phase-6\.2\.mjs'/);
    assert.match(source, /generatePieFullCirclePhase62\(/);
  }
});
