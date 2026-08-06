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
 *   - barcode/lib/src/ean.dart
 */

import { codeUnits } from '../base/utf8.ts';
import { Barcode1D } from './barcode_1d.ts';
import { BarcodeException } from './barcode_exception.ts';

/**
 * The common half of the EAN/UPC family: fixed lengths and check digits.
 *
 * ITF inherits from this too, for the modulo 10 checksum alone.
 */
export abstract class BarcodeEan extends Barcode1D {
  override get charSet(): Iterable<number> {
    return Array.from({ length: 10 }, (_unused, index) => index + 0x30);
  }

  /**
   * Check the length and verify the check digit; if the check digit was
   * omitted, compute and append it.
   */
  checkLength(data: string, length: number): string {
    if (data.length === length - 1) {
      data += this.checkSumModulo10(data);
    } else {
      if (data.length !== length) {
        throw new BarcodeException(
          `Unable to encode "${data}" to ${this.name} Barcode, it is not ${length} digits`
        );
      }

      const last = data.substring(length - 1);
      const checksum = this.checkSumModulo10(data.substring(0, length - 1));

      if (last !== checksum) {
        throw new BarcodeException(
          `Unable to encode "${data}" to ${this.name} Barcode, checksum "${last}" should be "${checksum}"`
        );
      }
    }

    return data;
  }

  /** The modulo 10 check digit. */
  checkSumModulo10(data: string): string {
    let sum = 0;
    let fak = data.length;
    for (const c of codeUnits(data)) {
      if (fak % 2 === 0) {
        sum += c - 0x30;
      } else {
        sum += (c - 0x30) * 3;
      }
      fak--;
    }
    if (sum % 10 === 0) {
      return '0';
    }
    return String.fromCharCode(10 - (sum % 10) + 0x30);
  }

  /** The modulo 11 check digit. */
  checkSumModulo11(data: string): string {
    let sum = 0;
    let pos = 10;
    for (const c of codeUnits(data)) {
      sum += (c - 0x30) * pos;
      pos--;
    }
    return String.fromCharCode(11 - (sum % 11) + 0x30);
  }

  /** The data padded to length and given its correct check digit. */
  normalize(data: string): string {
    return this.checkLength(
      data.padEnd(this.minLength, '0').substring(0, this.minLength),
      this.maxLength
    );
  }
}
