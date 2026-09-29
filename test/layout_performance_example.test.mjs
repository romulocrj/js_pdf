/*
 * js_pdf performance example integration tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateLayoutPerformancePhase66, runLayoutBenchmarkCase } from '../examples/layout-performance-phase-6.6.mjs';
import * as pw from '../src/index.ts';
import { latin1 } from './support/pdf-text.mjs';

test('performance workload is deterministic across source and bundle', () => {
  const bytes = generateLayoutPerformancePhase66();
  const normalize = bytes => Buffer.from(bytes).toString('latin1').replace(/\/CreationDate \(D:\d{14}Z\)/, '/CreationDate (D:20260929000000Z)');
  assert.equal(normalize(bytes), normalize(generateLayoutPerformancePhase66(pw)));
  assert.ok((latin1(bytes).match(/\/Type \/Page\b/g) ?? []).length > 1);
  for (const name of ['constraints', 'flex', 'ascii', 'mixed']) {
    assert.equal(runLayoutBenchmarkCase(pw, name, 100), runLayoutBenchmarkCase(pw, name, 100));
  }
});

test('performance visual proof follows phase 6.5 in the browser and phase runner', () => {
  for (const path of ['../examples/Browser.html', '../examples/run-phase-examples.mjs']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /import \{ generateLayoutPerformancePhase66 \} from '.\/layout-performance-phase-6\.6\.mjs'/);
    assert.match(source, /generateLayoutPerformancePhase66\(/);
    assert.ok(source.lastIndexOf('layout-performance-phase-6.6') > source.lastIndexOf('synchronous-output-phase-6.5'));
  }
});
