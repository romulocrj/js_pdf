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
 *   - barcode/lib/src/upce.dart
 */

import { codeUnits, utf8Decode } from '../base/utf8.ts';
import type { BarcodeDrawParams } from './barcode_1d.ts';
import { BarcodeException } from './barcode_exception.ts';
import { BarcodeMaps } from './barcode_maps.ts';
import { BarcodeText } from './barcode_operations.ts';
import type { BarcodeElement } from './barcode_operations.ts';
import { BarcodeEan } from './ean.ts';
import { BarcodeUpcA } from './upca.ts';

/**
 * UPC-E barcode.
 *
 * A zero-suppressed UPC-A, for packages too small to carry the full twelve
 * digits.
 */
export class BarcodeUpcE extends BarcodeEan {
  /** Fall back to UPC-A when the code cannot be suppressed. */
  readonly fallback: boolean;

  constructor(fallback: boolean) {
    super();
    this.fallback = fallback;
  }

  override get name(): string {
    return 'UPC E';
  }

  override get minLength(): number {
    return 6;
  }

  override get maxLength(): number {
    return 12;
  }

  override verifyBytes(data: Uint8Array): void {
    let text = utf8Decode(data);

    if (text.length <= 8) {
      text = this.upceToUpca(text);
    }

    if (text.length < 11) {
      throw new BarcodeException(
        `Unable to encode "${text}", minimum length is 11 for ${this.name} Barcode`
      );
    }

    const upca = this.checkLength(text, this.maxLength);
    if (!this.fallback) {
      this.upcaToUpce(upca);
    }

    super.verifyBytes(Uint8Array.from(codeUnits(text)));
  }

  /** Shorten a UPC-A code to UPC-E, or throw if it cannot be shortened. */
  upcaToUpce(data: string): string {
    if (!/^[01]\d{11}$/.test(data)) {
      throw new BarcodeException(`Unable to convert "${data}" to ${this.name} Barcode`);
    }

    const mc = data.substring(1, 6); // manufacturer code
    const pc = data.substring(6, 11); // product code

    if (['000', '100', '200'].includes(mc.substring(mc.length - 3)) && Number(pc) <= 999) {
      return `${mc.substring(0, 2)}${pc.substring(pc.length - 3)}${mc[2]}`;
    } else if (mc.substring(mc.length - 2) === '00' && Number(pc) <= 99) {
      return `${mc.substring(0, 3)}${pc.substring(pc.length - 2)}3`;
    } else if (mc.substring(mc.length - 1) === '0' && Number(pc) <= 9) {
      return `${mc.substring(0, 4)}${pc.substring(pc.length - 1)}4`;
    } else if (mc.substring(mc.length - 1) !== '0' && [5, 6, 7, 8, 9].includes(Number(pc))) {
      return mc + pc.substring(pc.length - 1);
    }

    throw new BarcodeException(`Unable to convert "${data}" to ${this.name} Barcode`);
  }

  /** Expand a UPC-E code back to the full UPC-A it stands for. */
  upceToUpca(data: string): string {
    if (!/^\d{6,8}$/.test(data)) {
      throw new BarcodeException(`Unable to convert "${data}" to UPC A Barcode`);
    }

    let first = '0';
    let checksum: string | null = null;

    switch (data.length) {
      case 8:
        checksum = data[7] as string;
        first = data[0] as string;
        data = data.substring(1, 7);
        break;
      case 7:
        first = data[0] as string;
        data = data.substring(1, 7);
        break;
    }

    if (first !== '0' && first !== '1') {
      throw new BarcodeException(`Unable to convert "${data}" to UPC A Barcode`);
    }

    const d1 = data[0] as string;
    const d2 = data[1] as string;
    const d3 = data[2] as string;
    const d4 = data[3] as string;
    const d5 = data[4] as string;
    const d6 = data[5] as string;

    let manufacturer: string;
    let product: string;

    switch (d6) {
      case '0':
      case '1':
      case '2':
        manufacturer = `${d1}${d2}${d6}00`;
        product = `00${d3}${d4}${d5}`;
        break;
      case '3':
        manufacturer = `${d1}${d2}${d3}00`;
        product = `000${d4}${d5}`;
        break;
      case '4':
        manufacturer = `${d1}${d2}${d3}${d4}0`;
        product = `0000${d5}`;
        break;
      default:
        manufacturer = `${d1}${d2}${d3}${d4}${d5}`;
        product = `0000${d6}`;
        break;
    }

    data = first + manufacturer + product;
    return data + (checksum ?? this.checkSumModulo10(data));
  }

  override convert(data: string): boolean[] {
    if (data.length <= 8) {
      data = this.upceToUpca(data);
    }

    data = this.checkLength(data, this.maxLength);
    const first = data.charCodeAt(0);
    const last = data.charCodeAt(11);

    let short: string;
    try {
      short = this.upcaToUpce(data);
    } catch (error) {
      if (this.fallback && error instanceof BarcodeException) {
        return new BarcodeUpcA().convert(data);
      }
      throw error;
    }

    const bits: boolean[] = [];

    // Start
    bits.push(...this.add(BarcodeMaps.eanStartEnd, 3));

    const parityRow = BarcodeMaps.upce.get(last) as number;
    const parity = first === 0x30 ? parityRow : parityRow ^ 0x3f;

    let index = 0;
    for (const code of codeUnits(short)) {
      const codes = BarcodeMaps.ean.get(code);

      if (codes === undefined) {
        throw new BarcodeException(
          `Unable to encode "${String.fromCharCode(code)}" to ${this.name} Barcode`
        );
      }

      bits.push(...this.add(codes[((parity >> index) & 1) === 0 ? 1 : 0] as number, 7));
      index++;
    }

    // Stop
    bits.push(...this.add(BarcodeMaps.eanEndUpcE, 6));

    return bits;
  }

  override marginLeft(params: BarcodeDrawParams): number {
    return params.drawText ? params.fontHeight : 0;
  }

  override marginRight(params: BarcodeDrawParams): number {
    return params.drawText ? params.fontHeight : 0;
  }

  override getHeight(index: number, count: number, params: BarcodeDrawParams): number {
    if (!params.drawText) {
      return super.getHeight(index, count, params);
    }

    const h = params.height - params.fontHeight - params.textPadding;

    if (index + count < 4 || index > 44) {
      return h + params.fontHeight / 2 + params.textPadding;
    }

    return h;
  }

  override makeText(data: string, params: BarcodeDrawParams, lineWidth: number): BarcodeElement[] {
    if (data.length <= 8) {
      data = this.upceToUpca(data);
    }

    data = this.checkLength(data, this.maxLength);
    const first = data.substring(0, 1);
    const last = data.substring(11, 12);

    let short: string;
    try {
      short = this.upcaToUpce(data);
    } catch (error) {
      if (this.fallback && error instanceof BarcodeException) {
        return new BarcodeUpcA().makeText(data, params, lineWidth);
      }
      throw error;
    }

    const result: BarcodeElement[] = [];
    const w = lineWidth * 7;
    const left = this.marginLeft(params);
    const right = this.marginRight(params);

    result.push(new BarcodeText(
      0,
      params.height - params.fontHeight,
      left - lineWidth,
      params.fontHeight,
      first,
      'right'
    ));

    let offset = left + lineWidth * 3;

    for (let i = 0; i < short.length; i++) {
      result.push(new BarcodeText(
        offset,
        params.height - params.fontHeight,
        w,
        params.fontHeight,
        short[i] as string,
        'center'
      ));

      offset += w;
    }

    result.push(new BarcodeText(
      params.width - right + lineWidth,
      params.height - params.fontHeight,
      right - lineWidth,
      params.fontHeight,
      last,
      'left'
    ));

    return result;
  }

  override normalize(data: string): string {
    if (data.length <= 8) {
      data = this.upceToUpca(data.padEnd(6, '0'));
    }

    data = this.checkLength(data, this.maxLength);
    const first = data.substring(0, 1);
    const last = data.substring(11, 12);

    let short: string;
    try {
      short = this.upcaToUpce(data);
    } catch (error) {
      if (this.fallback && error instanceof BarcodeException) {
        return data;
      }
      throw error;
    }

    return `${first}${short}${last}`;
  }
}
