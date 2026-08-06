/*
 * js_pdf production pagination regression runner.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { generateProductionPaginationExample } from './production-pagination.mjs';

const profileImage = new Uint8Array(
  await readFile(new URL('./assets/profile.jpg', import.meta.url))
);
const bytes = generateProductionPaginationExample(profileImage);
const outputDirectory = new URL('./out/', import.meta.url);

await mkdir(outputDirectory, { recursive: true });
await writeFile(new URL('production-pagination.pdf', outputDirectory), bytes);
console.log(`GENERATED out/production-pagination.pdf (${bytes.length} bytes)`);
