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
 *   - barcode/lib/src/telepen.dart
 */

import { codeUnits } from '../base/utf8.ts';
import { Barcode1D } from './barcode_1d.ts';
import { BarcodeException } from './barcode_exception.ts';
import { BarcodeMaps } from './barcode_maps.ts';

/**
 * Telepen barcode.
 *
 * A 1972 British design that expresses all 128 ASCII characters with only two
 * bar widths and no shift characters.
 */
export class BarcodeTelepen extends Barcode1D {
  override get charSet(): Iterable<number> {
    return Array.from({ length: 128 }, (_unused, index) => index);
  }

  override get name(): string {
    return 'Telepen';
  }

  override convert(data: string): boolean[] {
    const bits: boolean[] = [];

    // Start
    bits.push(...this.add(BarcodeMaps.telepenStart, BarcodeMaps.telepenLen));

    let checksum = 0;

    for (const code of codeUnits(data)) {
      if (code >= BarcodeMaps.telepen.length) {
        throw new BarcodeException(
          `Unable to encode "${String.fromCharCode(code)}" to ${this.name} Barcode`
        );
      }
      bits.push(...this.add(BarcodeMaps.telepen[code] as number, BarcodeMaps.telepenLen));
      checksum += code;
    }

    // Checksum
    checksum = 127 - (checksum % 127);
    if (checksum === 127) {
      checksum = 0;
    }
    bits.push(...this.add(BarcodeMaps.telepen[checksum] as number, BarcodeMaps.telepenLen));

    // Stop
    bits.push(...this.add(BarcodeMaps.telepenEnd, BarcodeMaps.telepenLen));

    return bits;
  }
}
