/*
 * js_pdf synchronous file-output host example.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import assert from 'node:assert/strict';
import { openSync, closeSync, readSync, writeSync, readFileSync, statSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CallbackPdfStream, createSynchronousOutputDocument } from './synchronous-output-phase-6.5.mjs';

const source = new URL('./assets/dpi-pattern.jpg', import.meta.url);
const target = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('./out/synchronous-output-direct.pdf', import.meta.url));
const { document, stats } = createSynchronousOutputDocument({ length: statSync(source).size,
  write: output => {
    const input = openSync(source, 'r');
    try {
      const chunk = new Uint8Array(1024);
      for (;;) {
        const count = readSync(input, chunk);
        if (count === 0) break;
        output.putBytes(chunk.subarray(0, count));
      }
    } finally { closeSync(input); }
  }
});
assert.equal(stats.imageWrites, 0);
mkdirSync(dirname(target), { recursive: true });
const file = openSync(target, 'w');
const output = new CallbackPdfStream(bytes => {
  let offset = 0;
  while (offset < bytes.length) {
    const count = writeSync(file, bytes, offset, bytes.length - offset);
    if (count === 0) throw new Error('File output made no progress');
    offset += count;
  }
});
try { document.write(output); } finally { closeSync(file); }
assert.equal(stats.imageWrites, 1);
assert.equal(statSync(target).size, output.offset);
// Only verification collects bytes; document.write above sends them directly.
assert.deepEqual(new Uint8Array(readFileSync(target)), document.save());
assert.equal(stats.imageWrites, 2);
console.log(`GENERATED ${target} (${output.offset} bytes, ${output.writeCount} writes); verified byte-identical to save()`);
