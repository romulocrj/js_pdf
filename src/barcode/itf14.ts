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
 *   - barcode/lib/src/itf14.dart
 */

import type { BarcodeDrawParams } from './barcode_1d.ts';
import type { BarcodeElement } from './barcode_operations.ts';
import { BarcodeItf } from './itf.ts';

/**
 * ITF-14 barcode.
 *
 * GS1's Interleaved 2 of 5 for a Global Trade Item Number, printed on the
 * outer packaging of a product. Always fourteen digits.
 */
export class BarcodeItf14 extends BarcodeItf {
  constructor(drawBorder: boolean, borderWidth: number | null, quietWidth: number | null) {
    super(true, true, drawBorder, borderWidth, quietWidth, 14);
  }

  override get name(): string {
    return 'ITF 14';
  }

  override makeText(data: string, params: BarcodeDrawParams, lineWidth: number): BarcodeElement[] {
    const text = this.checkLength(data, this.maxLength);
    const grouped = `${text.substring(0, 1)} ${text.substring(1, 3)} `
      + `${text.substring(3, 8)} ${text.substring(8, 13)} ${text.substring(13, 14)}`;
    return super.makeText(grouped, params, lineWidth);
  }
}
