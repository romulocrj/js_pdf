/*
 * js_pdf source gate.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Three invariants that are easy to break and expensive to discover late:
 *
 *   1. Runtime purity — nothing under src/ may reference a Node or browser
 *      API. The library has to run under ClearScript, which provides neither.
 *      tsconfig.json blocks most of this at compile time by compiling against
 *      the ES2020 lib alone; this check covers what a type system cannot, such
 *      as a forbidden name appearing in a comment that would survive into the
 *      bundle.
 *   2. No asynchrony — a ClearScript host has no event loop to pump.
 *   3. Attribution — every ported file must carry the dart_pdf attribution
 *      header, must keep David PHAM-VAN's copyright, and must name the Dart
 *      sources it was ported from.
 *
 * Build tooling (this file, rollup.config.mjs), tests and examples are exempt
 * from rules 1 and 2 and carry a shorter header.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');

const FORBIDDEN = [
  'require(',
  'process.',
  'globalThis.document',
  'globalThis.window',
  'window.document',
  'Buffer.',
  'TextEncoder',
  'TextDecoder',
  'setTimeout',
  'setInterval',
  'queueMicrotask',
  'fetch(',
  'node:',
  'document.createElement'
];

const ASYNC = [
  { token: 'async ', label: 'async function' },
  { token: 'await ', label: 'await expression' },
  { token: 'Promise', label: 'Promise' }
];

const REQUIRED_HEADER_LINES = [
  'Ported to JavaScript from DavBfr/dart_pdf.',
  'Copyright (C) 2017, David PHAM-VAN',
  'Copyright (C) 2026, Romulo Campos',
  'Licensed under the Apache License, Version 2.0.',
  'Original Dart sources ported into this file:'
];

async function collect(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await collect(path));
    else if (entry.name.endsWith('.ts')) found.push(path);
  }
  return found;
}

const problems = [];
const files = await collect(SRC);

if (files.length === 0) {
  problems.push('src/ contains no .ts files');
}

for (const path of files) {
  const name = relative(ROOT, path);
  const source = await readFile(path, 'utf8');
  const header = source.slice(0, source.indexOf('*/') + 2);
  const body = source.slice(header.length);

  for (const line of REQUIRED_HEADER_LINES) {
    if (!header.includes(line)) {
      problems.push(`${name}: header is missing "${line}"`);
    }
  }

  if (!/- pdf\/lib\/[^\s]+\.dart/.test(header)) {
    problems.push(`${name}: header lists no upstream Dart source path`);
  }

  for (const token of FORBIDDEN) {
    if (body.includes(token)) {
      problems.push(`${name}: references host API "${token}"`);
    }
  }

  for (const { token, label } of ASYNC) {
    if (body.includes(token)) {
      problems.push(`${name}: uses ${label}; src/ must stay synchronous`);
    }
  }

  // Relative imports must carry the .ts extension so Node can run src/
  // directly via type stripping; tsc rewrites them to .js on emit.
  for (const [, specifier] of body.matchAll(/from '(\.[^']*)'/g)) {
    if (!specifier.endsWith('.ts')) {
      problems.push(`${name}: relative import "${specifier}" must end in .ts`);
    }
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`FAIL ${problem}`);
  console.error(`\n${problems.length} problem(s) in ${files.length} source file(s)`);
  process.exitCode = 1;
} else {
  console.log(`OK ${files.length} source files: pure runtime, synchronous, attribution present`);
}
