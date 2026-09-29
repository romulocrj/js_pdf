/*
 * js_pdf reproducible bundle size comparison.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gzipSync, brotliCompressSync } from 'node:zlib';
const refs = process.argv.slice(2);
if (refs.length === 0) refs.push('v0.1.6', '68d5b1b');
const inputs = refs.map(ref => ({ ref, bytes: execFileSync('git', ['show', `${ref}:dist/js_pdf.min.mjs`], { maxBuffer: 8 * 1024 * 1024 }) }));
inputs.push({ ref: 'working-tree', bytes: readFileSync('dist/js_pdf.min.mjs') });
console.log(JSON.stringify({ node: process.version, gzipLevel: 9, brotliQuality: 11,
  bundles: inputs.map(({ ref, bytes }) => ({ ref, rawBytes: bytes.length,
    gzipBytes: gzipSync(bytes, { level: 9 }).length, brotliBytes: brotliCompressSync(bytes).length }))
}, null, 2));
