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
 *   - barcode/lib/src/postnet.dart
 */

import { codeUnits } from '../base/utf8.ts';
import { BarcodeException } from './barcode_exception.ts';
import { BarcodeHM } from './barcode_hm.ts';
import type { BarcodeHMBar } from './barcode_hm.ts';
import { BarcodeMaps } from './barcode_maps.ts';

/**
 * POSTNET barcode.
 *
 * The Postal Numeric Encoding Technique, used by the United States Postal
 * Service to route mail.
 */
export class BarcodePostnet extends BarcodeHM {
  constructor() {
    super(0);
  }

  override get charSet(): Iterable<number> {
    return [45, ...BarcodeMaps.postnet.keys()];
  }

  override get name(): string {
    return 'POSTNET';
  }

  override convertHM(data: string): BarcodeHMBar[] {
    const bars: BarcodeHMBar[] = [];

    bars.push(this.fromBits(BarcodeMaps.postnetStartStop));

    let sum = 0;
    for (const codeUnit of codeUnits(data)) {
      // A hyphen is allowed in a ZIP+4 but carries nothing.
      if (codeUnit === 45) {
        continue;
      }
      const code = BarcodeMaps.postnet.get(codeUnit);
      if (code === undefined) {
        throw new BarcodeException(
          `Unable to encode "${String.fromCharCode(codeUnit)}" to ${this.name}`
        );
      }
      bars.push(...this.addHW(code, BarcodeMaps.postnetLen));

      sum += codeUnit - 0x30;
    }

    const crc = (10 - (sum % 10)) % 10;
    bars.push(...this.addHW(
      BarcodeMaps.postnet.get(crc + 0x30) as number,
      BarcodeMaps.postnetLen
    ));

    bars.push(this.fromBits(BarcodeMaps.postnetStartStop));

    return bars;
  }
}
