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
 *   - barcode/lib/src/ean5.dart
 */

import { codeUnits } from '../base/utf8.ts';
import { BarcodeException } from './barcode_exception.ts';
import { BarcodeMaps } from './barcode_maps.ts';
import { BarcodeEan2 } from './ean2.ts';

/**
 * EAN 5 barcode.
 *
 * The five-digit supplement to an EAN 13 on a book, carrying a suggested
 * price.
 */
export class BarcodeEan5 extends BarcodeEan2 {
  override get name(): string {
    return 'EAN 5';
  }

  override get minLength(): number {
    return 5;
  }

  override get maxLength(): number {
    return 5;
  }

  override checkSumModulo10(data: string): string {
    let sum = 0;
    let fak = data.length;
    for (const c of codeUnits(data)) {
      if (fak % 2 === 0) {
        sum += (c - 0x30) * 9;
      } else {
        sum += (c - 0x30) * 3;
      }
      fak--;
    }
    return String.fromCharCode((sum % 10) + 0x30);
  }

  override convert(data: string): boolean[] {
    this.verify(data);

    const checksum = this.checkSumModulo10(data);
    const pattern = BarcodeMaps.ean5Checksum.get(checksum.charCodeAt(0)) as number;

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

      if (index >= 1) {
        bits.push(...this.add(BarcodeMaps.eanCenterEan2, 2));
      }

      bits.push(...this.add(codes[(pattern >> index) & 1] as number, 7));
      index++;
    }

    return bits;
  }
}
