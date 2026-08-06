/*
 * Ported to JavaScript from https://github.com/DavBfr/dart_pdf
 *
 * Original work:
 * Copyright (C) 2017, David PHAM-VAN <dev.nfet.net@gmail.com>
 *
 * JavaScript port: https://github.com/romulocrj/js_pdf
 * Copyright (C) 2026, Romulo Campos
 *
 * This file has been substantially modified from the original Dart source.
 *
 * Licensed under the Apache License, Version 2.0.
 *
 * Original Dart sources ported into this file:
 *   - pdf/lib/src/pdf/obj/pattern.dart
 */

import { PdfArray } from '../format/array.ts';
import { PdfDict } from '../format/dict.ts';
import { PdfNum } from '../format/num.ts';
import type { PdfMatrix } from '../matrix.ts';
import type { PdfShading } from './shading.ts';

export interface PdfShadingPatternOptions {
  readonly shading: PdfShading;
  readonly matrix?: PdfMatrix | null;
}

export class PdfShadingPattern {
  readonly shading: PdfShading;
  readonly matrix: PdfMatrix | null;

  constructor({ shading, matrix = null }: PdfShadingPatternOptions) {
    this.shading = shading;
    this.matrix = matrix;
  }

  output(): PdfDict {
    const result = new PdfDict([
      ['/PatternType', new PdfNum(2)],
      ['/Shading', this.shading.output()]
    ]);
    if (this.matrix !== null) {
      result.set('/Matrix', PdfArray.fromNum(this.matrix));
    }
    return result;
  }

  get key(): string {
    return this.output().toString();
  }
}
