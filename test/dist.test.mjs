/*
 * js_pdf tests.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Verifies the build artifacts: each must be a single self-contained ES module
 * that a bare V8 host (ClearScript) or a browser importmap can load — no
 * imports, no host APIs — carrying the attribution banner and nothing else,
 * and producing byte-identical PDFs to src/.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const { version } = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8')
);

const ARTIFACTS = [
  { name: 'js_pdf.mjs', minified: false },
  { name: `js_pdf-${version}.mjs`, minified: false },
  { name: 'js_pdf.min.mjs', minified: true },
  { name: `js_pdf-${version}.min.mjs`, minified: true }
];

const urlOf = name => new URL(`../dist/${name}`, import.meta.url);
const skip = ARTIFACTS.every(({ name }) => existsSync(urlOf(name)))
  ? false
  : 'run `npm run build` first';

const BANNER = `/*
 * romulocrj/js_pdf — JavaScript port of DavBfr/dart_pdf.
 *
 * Original work:
 * Copyright (C) 2017, David PHAM-VAN
 *
 * JavaScript port:
 * Copyright (C) 2026, Romulo Campos
 *
 * This file has been substantially modified from the original Dart source.
 *
 * Licensed under the Apache License, Version 2.0.
 *
 */
`;

for (const { name, minified } of ARTIFACTS) {
  test(`${name} is self-contained and host-free`, { skip }, async () => {
    const source = await readFile(urlOf(name), 'utf8');

    assert.ok(source.startsWith(BANNER), 'must open with the attribution banner');
    assert.equal(
      (source.match(/\/\*/g) ?? []).length, 1,
      'the banner must be the only block comment left in the bundle'
    );
    assert.equal(source.includes('//'), false, 'no line comments in the bundle');

    assert.equal(/^\s*import[\s{'"]/m.test(source), false, 'no remaining imports');
    for (const token of ['require(', 'process.', 'node:', 'Buffer.', 'TextEncoder', 'setTimeout', 'fetch(']) {
      assert.equal(source.includes(token), false, `references host API: ${token}`);
    }
  });

  test(`${name} produces the same bytes as src`, { skip }, async () => {
    const [dist, src] = await Promise.all([
      import(urlOf(name).href),
      import('../src/index.ts')
    ]);

    const build = api => new api.Page({ build: () => new api.Text('Hello js_pdf') });
    assert.deepEqual(
      Array.from(dist.createPdf({ title: 'x' }, build)),
      Array.from(src.createPdf({ title: 'x' }, build))
    );
  });

  test(`${name} is ${minified ? 'minified' : 'readable'}`, { skip }, async () => {
    const source = await readFile(urlOf(name), 'utf8');
    const body = source.slice(BANNER.length).trim();

    // The distinguishing property is name mangling, not line width: a few
    // expressions in the readable build are legitimately long because the
    // source expression is.
    if (minified) {
      assert.equal(body.includes('formatNumber('), false, 'identifiers must be mangled');
      assert.ok(body.split('\n').length < 20, 'expected few lines');
    } else {
      assert.ok(body.includes('formatNumber('), 'identifiers must be preserved');
      assert.ok(body.split('\n').length > 500, 'expected one statement per line');
      assert.match(body, /\n {2}\w/, 'expected two-space indentation');
    }
  });
}

test('the versioned artifacts match the canonical ones byte for byte', { skip }, async () => {
  const pairs = [
    ['js_pdf.mjs', `js_pdf-${version}.mjs`],
    ['js_pdf.min.mjs', `js_pdf-${version}.min.mjs`]
  ];

  for (const [canonical, versioned] of pairs) {
    const [a, b] = await Promise.all([
      readFile(urlOf(canonical), 'utf8'),
      readFile(urlOf(versioned), 'utf8')
    ]);
    assert.equal(a, b, `${versioned} must be a copy of ${canonical}`);
  }
});
