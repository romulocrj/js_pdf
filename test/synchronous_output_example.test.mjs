/*
 * js_pdf synchronous output example integration tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { latin1 } from './support/pdf-text.mjs';
const jpeg = () => new Uint8Array(readFileSync(new URL('../examples/assets/dpi-pattern.jpg', import.meta.url)));

test('synchronous output gallery verifies both paths and lazy image reuse', async () => {
  const { generateSynchronousOutputPhase65 } = await import('../examples/synchronous-output-phase-6.5.mjs');
  const bytes = generateSynchronousOutputPhase65(jpeg());
  const source = latin1(bytes);
  assert.equal((source.match(/\/Type \/Page\b/g) ?? []).length, 1);
  assert.equal((source.match(/\/Subtype \/Image/g) ?? []).length, 1);
  assert.match(source, /\/Title \(Synchronous output - phase 6.5\)/);
  assert.doesNotMatch(source, /NaN|Infinity/);
});

test('standalone host runner writes directly to a file and checks byte parity', () => {
  const directory = mkdtempSync(join(tmpdir(), 'js-pdf-output-'));
  try {
    const target = join(directory, 'output.pdf');
    const run = spawnSync(process.execPath, ['examples/run-synchronous-output.mjs', target], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.match(run.stdout, /verified byte-identical/);
    assert.ok(readFileSync(target).length > 1000);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('output example is registered after phase 6.4 in both galleries', () => {
  for (const path of ['../examples/Browser.html', '../examples/run-phase-examples.mjs']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /import \{ generateSynchronousOutputPhase65 \} from '.\/synchronous-output-phase-6\.5\.mjs'/);
    assert.match(source, /generateSynchronousOutputPhase65\(/);
    assert.ok(source.lastIndexOf('synchronous-output-phase-6.5') > source.lastIndexOf('text-breaking-phase-6.4'));
  }
});
