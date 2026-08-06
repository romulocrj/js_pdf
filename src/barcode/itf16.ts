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
 *   - barcode/lib/src/itf16.dart
 */

import type { BarcodeDrawParams } from './barcode_1d.ts';
import type { BarcodeElement } from './barcode_operations.ts';
import { BarcodeItf } from './itf.ts';

/**
 * ITF-16 barcode.
 *
 * The UPC Shipping Container Symbol: sixteen digits, the last a check digit,
 * marking cartons and pallets.
 */
export class BarcodeItf16 extends BarcodeItf {
  constructor(drawBorder: boolean, borderWidth: number | null, quietWidth: number | null) {
    super(true, true, drawBorder, borderWidth, quietWidth, 16);
  }

  override get name(): string {
    return 'ITF 16';
  }

  override makeText(data: string, params: BarcodeDrawParams, lineWidth: number): BarcodeElement[] {
    const text = this.checkLength(data, this.maxLength);
    const grouped = `${text.substring(0, 1)} ${text.substring(1, 3)} `
      + `${text.substring(3, 5)} ${text.substring(5, 10)} `
      + `${text.substring(10, 15)} ${text.substring(15, 16)}`;
    return super.makeText(grouped, params, lineWidth);
  }
}
