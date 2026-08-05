/*
 * js_pdf build configuration.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * `npm run build` is two stages: `tsc` compiles src/*.ts into build/ and writes
 * declarations straight to dist/types/, then rollup bundles build/index.js into
 * the distributable artifacts:
 *
 *   dist/js_pdf.mjs               readable, canonical (package.json exports)
 *   dist/js_pdf.min.mjs           minified, canonical
 *   dist/js_pdf-<version>.mjs     readable, versioned for drop-in hosts
 *   dist/js_pdf-<version>.min.mjs minified, versioned for drop-in hosts
 *   dist/types/**.d.ts            type declarations (emitted by tsc)
 *
 * Rollup deliberately consumes tsc's output rather than transpiling TypeScript
 * itself. TypeScript 7 ships the native compiler and no longer exposes the old
 * JavaScript compiler API, so @rollup/plugin-typescript and rollup-plugin-dts
 * both fail against it unless a legacy-compiler compatibility package is added
 * back. Going through `tsc` keeps the compiler as the single source of truth
 * for the emitted JavaScript and the declarations, with no extra dependency.
 *
 * Every JavaScript artifact carries the attribution banner and nothing else:
 * terser strips all comments and re-adds the banner as a preamble. A comment
 * filter would be fragile; stripping everything and re-adding the banner is not.
 *
 * Build tooling may use Node APIs; the bundled output must not — see
 * tools/check-source.mjs and test/dist.test.mjs.
 */

import { readFileSync } from 'node:fs';
import terser from '@rollup/plugin-terser';

const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
);

const banner = `/*
 * romulocrj/js_pdf — JavaScript port of DavBfr/dart_pdf.
 *
 * Original work:
 * Copyright (C) 2017, David PHAM-VAN <dev.nfet.net@gmail.com>
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

/** @param {boolean} minify Compress and mangle, or only reformat. */
const format = minify => terser({
  ecma: 2020,
  module: true,
  compress: minify,
  mangle: minify ? { module: true } : false,
  format: {
    preamble: banner,
    comments: false,
    beautify: !minify,
    indent_level: 2
  }
});

const output = (file, minify) => ({
  file,
  format: 'es',
  generatedCode: 'es2015',
  plugins: [format(minify)]
});

export default {
  input: 'build/index.js',
  output: [
    output('dist/js_pdf.mjs', false),
    output(`dist/js_pdf-${version}.mjs`, false),
    output('dist/js_pdf.min.mjs', true),
    output(`dist/js_pdf-${version}.min.mjs`, true)
  ],
  treeshake: {
    moduleSideEffects: false
  }
};
