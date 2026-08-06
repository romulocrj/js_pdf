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
 *   - barcode/lib/src/rm4scc.dart
 */

import { codeUnits } from '../base/utf8.ts';
import { BarcodeException } from './barcode_exception.ts';
import { BarcodeHM } from './barcode_hm.ts';
import type { BarcodeHMBar } from './barcode_hm.ts';
import { BarcodeMaps } from './barcode_maps.ts';

/**
 * RM4SCC barcode.
 *
 * The Royal Mail Cleanmail symbology: UK postcodes and delivery point
 * suffixes, read at sorting-machine speed.
 */
export class BarcodeRm4scc extends BarcodeHM {
  override get charSet(): Iterable<number> {
    return BarcodeMaps.rm4scc.keys();
  }

  override get name(): string {
    return 'RM4SCC';
  }

  override convertHM(data: string): BarcodeHMBar[] {
    const bars: BarcodeHMBar[] = [];

    bars.push(this.fromBits(BarcodeMaps.rm4sccStart));

    let sumTop = 0;
    let sumBottom = 0;
    // The check character is derived from the *position* of each character in
    // this table, so its order is part of the symbology.
    const keys = [...BarcodeMaps.rm4scc.keys()];

    for (const codeUnit of codeUnits(data)) {
      const code = BarcodeMaps.rm4scc.get(codeUnit);
      if (code === undefined) {
        throw new BarcodeException(
          `Unable to encode "${String.fromCharCode(codeUnit)}" to ${this.name}`
        );
      }
      bars.push(...this.addHW(code, BarcodeMaps.rm4sccLen));

      const index = keys.indexOf(codeUnit);
      sumTop += (Math.floor(index / 6) + 1) % 6;
      sumBottom += (index + 1) % 6;
    }

    // Dart's `%` never returns a negative remainder; JavaScript's does, and an
    // empty or one-character code makes both sums small enough to reach it.
    const crc = modulo(sumTop - 1, 6) * 6 + modulo(sumBottom - 1, 6);
    bars.push(...this.addHW(
      BarcodeMaps.rm4scc.get(keys[crc] as number) as number,
      BarcodeMaps.rm4sccLen
    ));

    bars.push(this.fromBits(BarcodeMaps.rm4sccStop));

    return bars;
  }
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
