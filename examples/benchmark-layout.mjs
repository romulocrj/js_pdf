/*
 * js_pdf comparative layout benchmark on Node's V8 engine.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { runLayoutBenchmarkCase, generateLayoutPerformancePhase66 } from './layout-performance-phase-6.6.mjs';
const baselinePath = process.argv[2];
if (!baselinePath) throw new Error('Usage: node examples/benchmark-layout.mjs /path/to/baseline.mjs [candidate.mjs]');
const baseline = await import(pathToFileURL(resolve(baselinePath)).href);
const candidate = await import(pathToFileURL(resolve(process.argv[3] ?? 'dist/js_pdf.mjs')).href);
// CreationDate is generated from the current clock; normalize only its fixed-width value.
const normalize = bytes => Buffer.from(Buffer.from(bytes).toString('latin1')
  .replace(/\/CreationDate \(D:\d{14}Z\)/, '/CreationDate (D:20260929000000Z)'), 'latin1');
const baselinePdf = normalize(generateLayoutPerformancePhase66(baseline));
const candidatePdf = normalize(generateLayoutPerformancePhase66(candidate));
assert.deepEqual(candidatePdf, baselinePdf, 'visual workload must remain byte-identical');
const results = [];
for (const [name, iterations] of [['constraints', 1000000], ['flex', 10000], ['ascii', 12000], ['mixed', 12000]]) {
  for (let i = 0; i < 3; i++) {
    runLayoutBenchmarkCase(baseline, name, iterations);
    runLayoutBenchmarkCase(candidate, name, iterations);
  }
  const timings = { baseline: [], candidate: [] };
  for (let sample = 0; sample < 9; sample++) {
    const order = sample % 2 ? [['candidate', candidate], ['baseline', baseline]] : [['baseline', baseline], ['candidate', candidate]];
    let checksum;
    for (const [label, api] of order) {
      const start = performance.now();
      const value = runLayoutBenchmarkCase(api, name, iterations);
      timings[label].push(performance.now() - start);
      if (checksum !== undefined) assert.equal(value, checksum, `${name} geometry checksum`);
      checksum = value;
    }
  }
  const summarize = values => { const sorted = [...values].sort((a,b) => a-b); return { medianMs: sorted[4], minMs: sorted[0], maxMs: sorted[8] }; };
  const before = summarize(timings.baseline), after = summarize(timings.candidate);
  results.push({ name, iterations, baseline: before, candidate: after, changePercent: (after.medianMs / before.medianMs - 1) * 100 });
}
console.log(JSON.stringify({ node: process.version, v8: process.versions.v8, platform: process.platform, arch: process.arch,
  normalizedCreationDate: '20260929000000Z', samples: 9, warmups: 3, pdfBytes: candidatePdf.length, pdfSha256: createHash('sha256').update(candidatePdf).digest('hex'), results }, null, 2));
