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
 *   - pdf/lib/src/pdf/obj/border.dart
 *
 */

import { PdfArray } from '../format/array.ts';
import { PdfDict } from '../format/dict.ts';
import { PdfName } from '../format/name.ts';
import { PdfNum } from '../format/num.ts';

export type PdfBorderStyle = 'solid' | 'dashed' | 'beveled' | 'inset' | 'underlined';
export interface PdfBorderOptions {
  readonly width?: number;
  readonly style?: PdfBorderStyle;
  readonly dash?: readonly number[] | null;
}
/** Direct border dictionary, resolved with the annotation rather than a registry. */
export class PdfBorder implements PdfBorderOptions {
  readonly width: number;
  readonly style: PdfBorderStyle;
  readonly dash: readonly number[] | null;
  constructor({ width = 1, style = 'solid', dash = null }: PdfBorderOptions = {}) {
    if (!Number.isFinite(width) || width < 0) throw new RangeError('Annotation border width must be a finite non-negative number');
    if (!['solid', 'dashed', 'beveled', 'inset', 'underlined'].includes(style)) throw new TypeError('Unknown annotation border style');
    if (dash !== null && (dash.some(v => !Number.isFinite(v) || v < 0) || (dash.length > 0 && dash.every(v => v === 0)))) throw new RangeError('Invalid annotation dash pattern');
    this.width = width; this.style = style; this.dash = dash === null ? null : Object.freeze([...dash]);
  }
  output(): PdfDict {
    const styles = { solid: '/S', dashed: '/D', beveled: '/B', inset: '/I', underlined: '/U' };
    const result = new PdfDict([['/W', new PdfNum(this.width)], ['/S', new PdfName(styles[this.style])]]);
    if (this.dash !== null) result.set('/D', PdfArray.fromNum(this.dash));
    return result;
  }
}
