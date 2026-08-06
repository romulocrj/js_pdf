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
 *   - barcode/lib/src/ean8.dart
 */

import { codeUnits, utf8Decode } from '../base/utf8.ts';
import type { BarcodeDrawParams } from './barcode_1d.ts';
import { BarcodeException } from './barcode_exception.ts';
import { BarcodeMaps } from './barcode_maps.ts';
import { BarcodeText } from './barcode_operations.ts';
import type { BarcodeElement } from './barcode_operations.ts';
import { BarcodeEan } from './ean.ts';

const START_SPACER = '<';
const FINAL_SPACER = '>';

/**
 * EAN 8 barcode.
 *
 * The short EAN, for packages an EAN 13 would not fit on.
 */
export class BarcodeEan8 extends BarcodeEan {
  /** Draw the '<' and '>' characters in the left and right margins. */
  readonly drawSpacers: boolean;

  constructor(drawSpacers: boolean) {
    super();
    this.drawSpacers = drawSpacers;
  }

  override get name(): string {
    return 'EAN 8';
  }

  override get minLength(): number {
    return 7;
  }

  override get maxLength(): number {
    return 8;
  }

  override verifyBytes(data: Uint8Array): void {
    this.checkLength(utf8Decode(data), this.maxLength);
    super.verifyBytes(data);
  }

  override convert(data: string): boolean[] {
    const bits: boolean[] = [];
    const text = this.checkLength(data, this.maxLength);

    // Start
    bits.push(...this.add(BarcodeMaps.eanStartEnd, 3));

    let index = 0;
    for (const code of codeUnits(text)) {
      const codes = BarcodeMaps.ean.get(code);

      if (codes === undefined) {
        throw new BarcodeException(
          `Unable to encode "${String.fromCharCode(code)}" to ${this.name} Barcode`
        );
      }

      if (index === 4) {
        bits.push(...this.add(BarcodeMaps.eanCenter, 5));
      }

      bits.push(...this.add(codes[index < 4 ? 0 : 2] as number, 7));
      index++;
    }

    // Stop
    bits.push(...this.add(BarcodeMaps.eanStartEnd, 3));

    return bits;
  }

  override marginLeft(params: BarcodeDrawParams): number {
    return params.drawText && this.drawSpacers ? params.fontHeight : 0;
  }

  override marginRight(params: BarcodeDrawParams): number {
    return params.drawText && this.drawSpacers ? params.fontHeight : 0;
  }

  override getHeight(index: number, count: number, params: BarcodeDrawParams): number {
    if (!params.drawText) {
      return super.getHeight(index, count, params);
    }

    const h = params.height - params.fontHeight - params.textPadding;

    if (index + count < 4 || (index > 31 && index + count < 36) || index > 63) {
      return h + params.fontHeight / 2 + params.textPadding;
    }

    return h;
  }

  override makeText(data: string, params: BarcodeDrawParams, lineWidth: number): BarcodeElement[] {
    const result: BarcodeElement[] = [];
    const text = this.checkLength(data, this.maxLength);
    const w = lineWidth * 7;
    const left = this.marginLeft(params);
    const right = this.marginRight(params);
    let offset = left + lineWidth * 3;

    for (let i = 0; i < text.length; i++) {
      result.push(new BarcodeText(
        offset,
        params.height - params.fontHeight,
        w,
        params.fontHeight,
        text[i] as string,
        'center'
      ));

      offset += w;
      if (i === 3) {
        offset += lineWidth * 5;
      }
    }

    if (this.drawSpacers) {
      result.push(new BarcodeText(
        0,
        params.height - params.fontHeight,
        left - lineWidth,
        params.fontHeight,
        START_SPACER,
        'right'
      ));
      result.push(new BarcodeText(
        params.width - right + lineWidth,
        params.height - params.fontHeight,
        right - lineWidth,
        params.fontHeight,
        FINAL_SPACER,
        'left'
      ));
    }

    return result;
  }
}
