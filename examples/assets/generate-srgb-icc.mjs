/*
 * js_pdf example ICC profile generator.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * Writes JsPdfSrgbExample.icc, the port-authored sRGB-like v2 display profile
 * that the PDF/A example and tests embed. The recipe lives in
 * test/support/icc-profile.mjs; test/pdfa_phase_6_11.test.mjs checks that the
 * committed file is its output. Production PDF/A should embed a standard
 * profile supplied by the caller, such as the ICC's sRGB2014.
 *
 *   node examples/assets/generate-srgb-icc.mjs
 */

import { writeFileSync } from 'node:fs';
import { srgbIccProfile } from '../../test/support/icc-profile.mjs';

const target = new URL('./JsPdfSrgbExample.icc', import.meta.url);
const profile = srgbIccProfile();
writeFileSync(target, profile);
console.log(`WROTE examples/assets/JsPdfSrgbExample.icc (${profile.length} bytes)`);
