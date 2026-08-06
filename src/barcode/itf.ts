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
 *   - barcode/lib/src/itf.dart
 */

import { codeUnits, utf8Decode, utf8Encode } from '../base/utf8.ts';
import type { BarcodeMakeOptions } from './barcode.ts';
import { drawParams } from './barcode_1d.ts';
import type { BarcodeDrawParams } from './barcode_1d.ts';
import { BarcodeException } from './barcode_exception.ts';
import { BarcodeMaps } from './barcode_maps.ts';
import { BarcodeBar } from './barcode_operations.ts';
import type { BarcodeElement } from './barcode_operations.ts';
import { BarcodeEan } from './ean.ts';

/**
 * Interleaved 2 of 5 barcode.
 *
 * A continuous two-width symbology for digits, encoding one digit in the bars
 * and the next in the spaces between them.
 */
export class BarcodeItf extends BarcodeEan {
  /** Append a modulo 10 check digit. */
  readonly addChecksum: boolean;

  /** Prepend a '0' when the length is not even. */
  readonly zeroPrepend: boolean;

  /** Draw a black border around the barcode. */
  readonly drawBorder: boolean;

  /** Width of that border. */
  readonly borderWidth: number | null;

  /** Width of the quiet zone inside the border. */
  readonly quietWidth: number | null;

  /** The barcode length, when it is fixed. */
  readonly fixedLength: number | null;

  constructor(
    addChecksum: boolean,
    zeroPrepend: boolean,
    drawBorder: boolean,
    borderWidth: number | null,
    quietWidth: number | null,
    fixedLength: number | null
  ) {
    super();
    if (fixedLength !== null && fixedLength % 2 !== 0) {
      throw new BarcodeException('An ITF barcode of fixed length needs an even one');
    }
    this.addChecksum = addChecksum;
    this.zeroPrepend = zeroPrepend;
    this.drawBorder = drawBorder;
    this.borderWidth = borderWidth;
    this.quietWidth = quietWidth;
    this.fixedLength = fixedLength;
  }

  override get name(): string {
    return 'ITF';
  }

  override get minLength(): number {
    return this.fixedLength !== null ? this.fixedLength - 1 : super.minLength;
  }

  override get maxLength(): number {
    return this.fixedLength !== null ? this.fixedLength : super.maxLength;
  }

  private getBorderWidth(width: number): number {
    return this.borderWidth ?? width * 0.015;
  }

  private getQuietWidth(width: number): number {
    return this.quietWidth ?? width * 0.07;
  }

  override marginTop(params: BarcodeDrawParams): number {
    return this.drawBorder ? this.getBorderWidth(params.width) : 0;
  }

  override marginLeft(params: BarcodeDrawParams): number {
    return this.drawBorder
      ? this.getBorderWidth(params.width) + this.getQuietWidth(params.width)
      : 0;
  }

  override marginRight(params: BarcodeDrawParams): number {
    return this.drawBorder
      ? this.getBorderWidth(params.width) + this.getQuietWidth(params.width)
      : 0;
  }

  override getHeight(index: number, count: number, params: BarcodeDrawParams): number {
    return super.getHeight(index, count, params)
      - (this.drawBorder ? this.getBorderWidth(params.width) : 0);
  }

  /** The data with the padding and check digit the options ask for. */
  private padded(data: string): string {
    if (this.zeroPrepend && (data.length % 2 !== 0) !== this.addChecksum) {
      data = `0${data}`;
    }

    if (this.addChecksum) {
      data += this.checkSumModulo10(data);
    }

    return data;
  }

  override convert(data: string): boolean[] {
    if (this.fixedLength !== null) {
      data = this.checkLength(data, this.fixedLength);
    } else {
      data = this.padded(data);

      if (data.length % 2 !== 0) {
        throw new BarcodeException(
          `${this.name} barcode can only encode an even number of digits.`
        );
      }
    }

    const bits: boolean[] = [];

    // Start
    bits.push(...this.add(BarcodeMaps.itfStart, 4));

    const cu = codeUnits(data);
    for (let i = 0; i < cu.length / 2; i++) {
      const tuple = [
        BarcodeMaps.itf.get(cu[i * 2] as number),
        BarcodeMaps.itf.get(cu[i * 2 + 1] as number)
      ];

      if (tuple[0] === undefined || tuple[1] === undefined) {
        throw new BarcodeException(
          `Unable to encode "${String.fromCharCode(cu[i * 2] as number)}`
          + `${String.fromCharCode(cu[i * 2 + 1] as number)}" to ${this.name} Barcode`
        );
      }

      // The two digits interleave: even modules come from the first, odd ones
      // from the second, and a set bit widens the module threefold.
      for (let n = 0; n < 10; n++) {
        const v = ((tuple[n % 2] as number) >> Math.floor(n / 2)) & 1;
        const c = n % 2 === 0;
        bits.push(c);
        if (v !== 0) {
          bits.push(c, c);
        }
      }
    }

    // End
    bits.push(...this.add(BarcodeMaps.itfEnd, 5));

    return bits;
  }

  override makeBytes(data: Uint8Array, options: BarcodeMakeOptions): BarcodeElement[] {
    const params = drawParams(options);
    const result = [...super.makeBytes(data, options)];

    if (this.drawBorder) {
      const bw = this.getBorderWidth(params.width);
      const hp = params.drawText ? params.fontHeight + params.textPadding : 0;

      result.push(new BarcodeBar(0, 0, params.width, bw, true));
      result.push(new BarcodeBar(0, params.height - hp - bw, params.width, bw, true));
      result.push(new BarcodeBar(0, bw, bw, params.height - hp - bw * 2, true));
      result.push(new BarcodeBar(
        params.width - bw,
        bw,
        bw,
        params.height - hp - bw * 2,
        true
      ));
    }

    return result;
  }

  override makeText(data: string, params: BarcodeDrawParams, lineWidth: number): BarcodeElement[] {
    const text = this.fixedLength !== null ? data : this.padded(data);
    return super.makeText(text, params, lineWidth);
  }

  override verifyBytes(data: Uint8Array): void {
    let text = utf8Decode(data);

    if (this.fixedLength !== null) {
      text = this.checkLength(text, this.maxLength);
    } else {
      text = this.padded(text);
    }

    if (text.length % 2 !== 0) {
      throw new BarcodeException(
        `${this.name} barcode can only encode an even number of digits.`
      );
    }

    super.verifyBytes(utf8Encode(text));
  }

  override normalize(data: string): string {
    if (this.fixedLength !== null) {
      return this.checkLength(
        this.zeroPrepend ? data.padEnd(this.minLength, '0').substring(0, this.minLength) : data,
        this.maxLength
      );
    }

    return this.padded(data);
  }
}
