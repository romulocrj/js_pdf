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
 *   - barcode/lib/src/code93.dart
 */

import { codeUnits } from '../base/utf8.ts';
import { Barcode1D } from './barcode_1d.ts';
import { BarcodeException } from './barcode_exception.ts';
import { BarcodeMaps } from './barcode_maps.ts';

/**
 * Code 93 barcode.
 *
 * A denser, more secure alphanumeric successor to Code 39, designed by
 * Intermec in 1982 and used mostly by Canada Post.
 */
export class BarcodeCode93 extends Barcode1D {
  override get charSet(): Iterable<number> {
    return [...BarcodeMaps.code93.keys()].filter(x => x > 0);
  }

  override get name(): string {
    return 'CODE 93';
  }

  override convert(data: string): boolean[] {
    const bits: boolean[] = [];

    // Start
    bits.push(...this.add(BarcodeMaps.code93StartStop, BarcodeMaps.code93Len));

    // The two check characters are the *positions* of the data characters in
    // this table, so its order is part of the symbology.
    const keys = [...BarcodeMaps.code93.keys()];
    const units = codeUnits(data);

    for (const code of units) {
      const codeValue = BarcodeMaps.code93.get(code);
      if (codeValue === undefined) {
        throw new BarcodeException(
          `Unable to encode "${String.fromCharCode(code)}" to ${this.name} Barcode`
        );
      }
      bits.push(...this.add(codeValue, BarcodeMaps.code93Len));
    }

    // Checksum
    let sumC = 0;
    let sumK = 0;
    let indexC = 1;
    let indexK = 2;

    for (let index = units.length - 1; index >= 0; index--) {
      const code = units[index] as number;
      sumC += keys.indexOf(code) * indexC;
      sumK += keys.indexOf(code) * indexK;

      indexC++;
      if (indexC > 20) indexC = 1;
      indexK++;
      if (indexK > 15) indexK = 1;
    }

    sumC = sumC % 47;
    bits.push(...this.add(
      BarcodeMaps.code93.get(keys[sumC] as number) as number,
      BarcodeMaps.code93Len
    ));

    sumK = (sumK + sumC) % 47;
    bits.push(...this.add(
      BarcodeMaps.code93.get(keys[sumK] as number) as number,
      BarcodeMaps.code93Len
    ));

    // Stop
    bits.push(...this.add(BarcodeMaps.code93StartStop, BarcodeMaps.code93Len));

    // Termination bar
    bits.push(true);

    return bits;
  }
}
