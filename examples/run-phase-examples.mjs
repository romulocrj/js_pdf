/*
 * js_pdf completed-phase example runner.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { generateSvgGradientsPhase28 } from './svg-gradients-phase-2.8.mjs';
import { generateTablePhase31 } from './table-phase-3.1.mjs';
import { generateTableSpanningPhase32 } from './table-spanning-phase-3.2.mjs';
import { generateBasicWidgetsPhase33 } from './basic-widgets-phase-3.3.mjs';
import { generateFlexLayoutPhase34 } from './flex-layout-phase-3.4.mjs';
import { generateDecorationPhase35 } from './decoration-phase-3.5.mjs';
import { generateLayoutPhase36 } from './layout-phase-3.6.mjs';
import { generateRichTextPhase37 } from './rich-text-phase-3.7.mjs';
import { generateContentPhase38 } from './content-phase-3.8.mjs';
import { generatePlaceholdersPhase39 } from './placeholders-phase-3.9.mjs';
import { generateClippingPhase310 } from './clipping-phase-3.10.mjs';
import { generatePngPhase41 } from './png-phase-4.1.mjs';
import { generateJpegPhase42 } from './jpeg-phase-4.2.mjs';
import { generateImagePhase43 } from './image-phase-4.3.mjs';
import { generateChartsPhase51 } from './charts-phase-5.1.mjs';
import { generateBarcodePhase52 } from './barcode-phase-5.2.mjs';
import { generateAnnotationsPhase53 } from './annotations-phase-5.3.mjs';
import { generateIconsPhase54 } from './icons-phase-5.4.mjs';
import { generateProgressPhase55 } from './progress-phase-5.5.mjs';

const materialIcons = new Uint8Array(
  await readFile(new URL('./assets/MaterialIcons.ttf', import.meta.url))
);

const examples = [
  ['svg-gradients-phase-2.8', generateSvgGradientsPhase28],
  ['table-phase-3.1', generateTablePhase31],
  ['table-spanning-phase-3.2', generateTableSpanningPhase32],
  ['basic-widgets-phase-3.3', generateBasicWidgetsPhase33],
  ['flex-layout-phase-3.4', generateFlexLayoutPhase34],
  ['decoration-phase-3.5', generateDecorationPhase35],
  ['layout-phase-3.6', generateLayoutPhase36],
  ['rich-text-phase-3.7', generateRichTextPhase37],
  ['content-phase-3.8', generateContentPhase38],
  ['placeholders-phase-3.9', generatePlaceholdersPhase39],
  ['clipping-phase-3.10', generateClippingPhase310],
  ['png-phase-4.1', generatePngPhase41],
  ['jpeg-phase-4.2', generateJpegPhase42],
  ['image-phase-4.3', generateImagePhase43],
  ['charts-phase-5.1', generateChartsPhase51],
  ['barcode-phase-5.2', generateBarcodePhase52],
  ['annotations-phase-5.3', generateAnnotationsPhase53],
  ['icons-phase-5.4', () => generateIconsPhase54(materialIcons)],
  ['progress-phase-5.5', generateProgressPhase55]
];

const outputDirectory = new URL('./out/', import.meta.url);
await mkdir(outputDirectory, { recursive: true });

for (const [name, generate] of examples) {
  const generated = generate();
  const bytes = generated instanceof Uint8Array ? generated : new Uint8Array(generated);
  await writeFile(new URL(`${name}.pdf`, outputDirectory), bytes);
  console.log(`GENERATED out/${name}.pdf (${bytes.length} bytes)`);
}
