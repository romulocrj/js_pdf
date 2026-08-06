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
 *   - barcode/lib/src/ean2.dart
 */

import { codeUnits } from '../base/utf8.ts';
import type { BarcodeDrawParams } from './barcode_1d.ts';
import { BarcodeException } from './barcode_exception.ts';
import { BarcodeMaps } from './barcode_maps.ts';
import { BarcodeText } from './barcode_operations.ts';
import type { BarcodeElement } from './barcode_operations.ts';
import { BarcodeEan } from './ean.ts';

/**
 * EAN 2 barcode.
 *
 * A supplement to EAN 13 and UPC-A, printed on magazines to carry the issue
 * number.
 */
export class BarcodeEan2 extends BarcodeEan {
  override get name(): string {
    return 'EAN 2';
  }

  override get minLength(): number {
    return 2;
  }

  override get maxLength(): number {
    return 2;
  }

  override convert(data: string): boolean[] {
    this.verify(data);

    const idata = Number(data);
    if (!Number.isInteger(idata)) {
      throw new BarcodeException(`Unable to encode "${data}" to ${this.name} Barcode`);
    }
    const pattern = idata % 4;

    const bits: boolean[] = [];

    // Start
    bits.push(...this.add(BarcodeMaps.eanStartEan2, 5));

    let index = 0;
    for (const code of codeUnits(data)) {
      const codes = BarcodeMaps.ean.get(code);

      if (codes === undefined) {
        throw new BarcodeException(
          `Unable to encode "${String.fromCharCode(code)}" to ${this.name} Barcode`
        );
      }

      if (index === 1) {
        bits.push(...this.add(BarcodeMaps.eanCenterEan2, 2));
      }

      if (index === 0) {
        bits.push(...this.add(codes[pattern < 2 ? 0 : 1] as number, 7));
      } else {
        bits.push(...this.add(codes[pattern % 2 === 0 ? 0 : 1] as number, 7));
      }
      index++;
    }

    return bits;
  }

  override marginTop(params: BarcodeDrawParams): number {
    // The text of a supplement goes above the bars, not below them.
    return params.drawText ? params.fontHeight + params.textPadding : 0;
  }

  override getHeight(_index: number, _count: number, params: BarcodeDrawParams): number {
    return params.height;
  }

  override makeText(data: string, params: BarcodeDrawParams, _lineWidth: number): BarcodeElement[] {
    return [new BarcodeText(0, 0, params.width, params.fontHeight, data, 'center')];
  }

  override normalize(data: string): string {
    return data.padEnd(this.minLength, '0').substring(0, this.minLength);
  }
}
