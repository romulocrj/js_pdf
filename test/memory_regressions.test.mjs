/*
 * js_pdf memory regression tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('a 4096x3515 PNG decodes and materializes under a 64 MB JS heap', () => {
  const output = execFileSync(process.execPath, [
    '--max-old-space-size=64',
    '--expose-gc',
    new URL('./memory-image-child.mjs', import.meta.url).pathname
  ], { encoding: 'utf8', timeout: 60000 });
  assert.equal(output, '');
});
