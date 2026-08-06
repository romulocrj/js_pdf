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
 *   - pdf/lib/src/pdf/obj/shading.dart
 */

import { PdfArray } from '../format/array.ts';
import { PdfBool } from '../format/bool.ts';
import { PdfDict } from '../format/dict.ts';
import { PdfName } from '../format/name.ts';
import { PdfNum } from '../format/num.ts';
import type { PdfPoint, PdfRect } from '../rect.ts';

export type PdfShadingType = 'axial' | 'radial';

export interface PdfShadingOptions {
  readonly type: PdfShadingType;
  readonly fn: PdfDict;
  readonly start: PdfPoint;
  readonly end: PdfPoint;
  readonly radius0?: number | null;
  readonly radius1?: number | null;
  readonly boundingBox?: PdfRect | null;
  readonly extendStart?: boolean;
  readonly extendEnd?: boolean;
}

export class PdfShading {
  readonly options: PdfShadingOptions;

  constructor(options: PdfShadingOptions) {
    this.options = options;
    if (options.type === 'radial' && (options.radius0 == null || options.radius1 == null)) {
      throw new TypeError('A radial shading needs both radii');
    }
  }

  output(): PdfDict {
    const { options } = this;
    const result = new PdfDict([
      ['/ShadingType', new PdfNum(options.type === 'axial' ? 2 : 3)]
    ]);

    if (options.boundingBox !== null && options.boundingBox !== undefined) {
      const box = options.boundingBox;
      result.set('/BBox', PdfArray.fromNum([
        box.x, box.y, box.x + box.width, box.y + box.height
      ]));
    }

    result.set('/AntiAlias', new PdfBool(true));
    result.set('/ColorSpace', new PdfName('/DeviceRGB'));
    result.set('/Coords', options.type === 'axial'
      ? PdfArray.fromNum([options.start.x, options.start.y, options.end.x, options.end.y])
      : PdfArray.fromNum([
        options.start.x,
        options.start.y,
        options.radius0!,
        options.end.x,
        options.end.y,
        options.radius1!
      ]));

    if (options.extendStart === true || options.extendEnd === true) {
      result.set('/Extend', new PdfArray([
        new PdfBool(options.extendStart ?? false),
        new PdfBool(options.extendEnd ?? false)
      ]));
    }
    result.set('/Function', options.fn);
    return result;
  }
}
