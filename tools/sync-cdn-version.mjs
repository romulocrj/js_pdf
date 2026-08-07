/*
 * js_pdf CDN pin sync.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * The README shows the CDN imports pinned to an exact version, because an
 * unpinned URL serves whatever was published last and changes under the reader
 * without them asking for it. A pin is only worth showing while it is correct,
 * and a number copied by hand into prose is exactly the kind of thing that
 * survives three releases unnoticed. So the build rewrites it from
 * package.json instead of trusting anyone to remember.
 *
 * Only version pins inside a package specifier are touched. Prose that names a
 * version deliberately — "0.1.6 is the first release candidate" — is left
 * alone, because it is a statement about that version, not about the current
 * one.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const FILES = ['README.md', 'AI_USAGE.md', 'examples/Browser.html'];

const { name, version } = JSON.parse(
  await readFile(join(ROOT, 'package.json'), 'utf8')
);

const escaped = name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// "@scope/name@1.2.3" or "@scope/name@1.2.3-rc.1", as it appears in a CDN URL.
const PIN = new RegExp(`(${escaped}@)(\\d+\\.\\d+\\.\\d+[\\w.-]*)`, 'g');

let pins = 0;
let rewritten = 0;

for (const file of FILES) {
  const path = join(ROOT, file);
  const before = await readFile(path, 'utf8');

  const after = before.replace(PIN, (match, specifier, pinned) => {
    pins += 1;
    if (pinned === version) return match;
    rewritten += 1;
    return `${specifier}${version}`;
  });

  if (after !== before) await writeFile(path, after);
}

if (pins === 0) {
  console.error(`FAIL no ${name}@<version> pin found in ${FILES.join(', ')}`);
  process.exitCode = 1;
} else if (rewritten > 0) {
  console.log(`OK ${rewritten} of ${pins} CDN pin(s) updated to ${version}`);
} else {
  console.log(`OK ${pins} CDN pin(s) already at ${version}`);
}
