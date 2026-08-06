/*
 * Ported to JavaScript from DavBfr/dart_pdf.
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
 * Original Dart sources ported into this file:
 *   - barcode/lib/src/isbn.dart
 */

import type { BarcodeDrawParams } from './barcode_1d.ts';
import { BarcodeText } from './barcode_operations.ts';
import type { BarcodeElement } from './barcode_operations.ts';
import { BarcodeEan13 } from './ean13.ts';

/**
 * ISBN barcode.
 *
 * An EAN 13 whose number is also spelled out, hyphenated, above the bars.
 */
export class BarcodeIsbn extends BarcodeEan13 {
  /** Draw the ISBN number as text above the barcode. */
  readonly drawIsbn: boolean;

  constructor(drawEndChar: boolean, drawIsbn: boolean) {
    super(drawEndChar);
    this.drawIsbn = drawIsbn;
  }

  override get name(): string {
    return 'ISBN';
  }

  override marginTop(params: BarcodeDrawParams): number {
    if (!params.drawText || !this.drawIsbn) {
      return super.marginTop(params);
    }

    return params.fontHeight + params.textPadding;
  }

  override makeText(data: string, params: BarcodeDrawParams, lineWidth: number): BarcodeElement[] {
    const text = this.checkLength(data, this.maxLength);
    const result = [...super.makeText(text, params, lineWidth)];

    if (this.drawIsbn) {
      const isbn = `${text.substring(0, 3)}-${text.substring(3, 12)}-${text.substring(12, 13)}`;

      result.push(new BarcodeText(
        0,
        0,
        params.width,
        params.fontHeight,
        `ISBN ${isbn}`,
        'center'
      ));
    }

    return result;
  }
}
