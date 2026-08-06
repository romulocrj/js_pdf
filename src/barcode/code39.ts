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
 *   - barcode/lib/src/code39.dart
 */

import { codeUnits } from '../base/utf8.ts';
import { Barcode1D } from './barcode_1d.ts';
import type { BarcodeDrawParams } from './barcode_1d.ts';
import { BarcodeException } from './barcode_exception.ts';
import { BarcodeMaps } from './barcode_maps.ts';
import { BarcodeText } from './barcode_operations.ts';
import type { BarcodeElement } from './barcode_operations.ts';

/**
 * Code 39 barcode.
 *
 * 43 characters: A-Z, 0-9 and `- . $ / + %` and space. A 44th, `*`, delimits
 * the symbol at both ends; [drawSpacers] decides whether it is also printed.
 */
export class BarcodeCode39 extends Barcode1D {
  readonly drawSpacers: boolean;

  constructor(drawSpacers: boolean) {
    super();
    this.drawSpacers = drawSpacers;
  }

  override get charSet(): Iterable<number> {
    return BarcodeMaps.code39.keys();
  }

  override get name(): string {
    return 'CODE 39';
  }

  override convert(data: string): boolean[] {
    const bits: boolean[] = [];

    bits.push(...this.add(BarcodeMaps.code39StartStop, BarcodeMaps.code39Len));

    for (const code of codeUnits(data)) {
      const codeValue = BarcodeMaps.code39.get(code);
      if (codeValue === undefined) {
        throw new BarcodeException(
          `Unable to encode "${String.fromCharCode(code)}" to ${this.name} Barcode`
        );
      }
      bits.push(...this.add(codeValue, BarcodeMaps.code39Len));
    }

    bits.push(...this.add(BarcodeMaps.code39StartStop, BarcodeMaps.code39Len));

    return bits;
  }

  override makeText(data: string, params: BarcodeDrawParams, lineWidth: number): BarcodeElement[] {
    const text = this.drawSpacers ? `*${data}*` : data;
    const additionalOffset = this.drawSpacers ? 0 : 1;
    const result: BarcodeElement[] = [];

    for (let i = 0; i < text.length; i++) {
      result.push(new BarcodeText(
        lineWidth * BarcodeMaps.code39Len * (i + additionalOffset),
        params.height - params.fontHeight,
        lineWidth * BarcodeMaps.code39Len,
        params.fontHeight,
        text[i] as string,
        'center'
      ));
    }

    return result;
  }
}
