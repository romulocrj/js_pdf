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
 *   - barcode/lib/src/barcode_1d.dart
 *
 * A one-dimensional symbology reduces to a run of booleans; this class turns
 * that run into rectangles and places the human-readable text under it.
 *
 * Divergence: upstream's overridable hooks each take the same five positional
 * measurements — `drawText, width, height, fontHeight, textPadding` — repeated
 * across a dozen files. They travel as one record here. It reads the same, it
 * removes a whole class of argument-order mistakes from a port of this size,
 * and it keeps TypeScript's unused-parameter check meaningful: a hook that
 * ignores its input names one parameter, not five.
 */

import { utf8Decode } from '../base/utf8.ts';
import { Barcode } from './barcode.ts';
import type { BarcodeMakeOptions } from './barcode.ts';
import { BarcodeBar, BarcodeText } from './barcode_operations.ts';
import type { BarcodeElement } from './barcode_operations.ts';

/** Default padding between the text and the bars. */
export const DEFAULT_TEXT_PADDING = 0;

/** The measurements every drawing hook is handed. */
export interface BarcodeDrawParams {
  readonly drawText: boolean;
  readonly width: number;
  readonly height: number;
  readonly fontHeight: number;
  readonly textPadding: number;
}

/** One-dimensional barcode generation class. */
export abstract class Barcode1D extends Barcode {
  override makeBytes(data: Uint8Array, options: BarcodeMakeOptions): BarcodeElement[] {
    const params = drawParams(options);
    const result: BarcodeElement[] = [];

    const text = utf8Decode(data);
    const bits = this.convert(text);

    if (bits.length === 0) {
      return result;
    }

    const top = this.marginTop(params);
    const left = this.marginLeft(params);
    const right = this.marginRight(params);
    const lineWidth = (params.width - left - right) / bits.length;

    // The bar heights are measured from below the top margin, which is why
    // `getHeight` sees a shortened box rather than the full one.
    const inner: BarcodeDrawParams = { ...params, height: params.height - top };

    let color = bits[0] as boolean;
    let count = 1;

    for (let i = 1; i < bits.length; i++) {
      if (color === bits[i]) {
        count++;
        continue;
      }

      result.push(new BarcodeBar(
        left + (i - count) * lineWidth,
        top,
        count * lineWidth,
        this.getHeight(i - count, count, inner),
        color
      ));

      color = bits[i] as boolean;
      count = 1;
    }

    const l = bits.length;
    result.push(new BarcodeBar(
      left + (l - count) * lineWidth,
      top,
      count * lineWidth,
      this.getHeight(l - count, count, inner),
      color
    ));

    if (params.drawText) {
      result.push(...this.makeText(text, params, lineWidth));
    }

    return result;
  }

  /** The height of the bar at a given index. */
  getHeight(_index: number, _count: number, params: BarcodeDrawParams): number {
    return params.height - (params.drawText ? params.fontHeight + params.textPadding : 0);
  }

  /** Margin above the first bar. */
  marginTop(_params: BarcodeDrawParams): number {
    return 0;
  }

  /** Margin before the first bar. */
  marginLeft(_params: BarcodeDrawParams): number {
    return 0;
  }

  /** Margin after the last bar. */
  marginRight(_params: BarcodeDrawParams): number {
    return 0;
  }

  /** The text operations drawn under the bars. */
  makeText(data: string, params: BarcodeDrawParams, _lineWidth: number): BarcodeElement[] {
    return [new BarcodeText(
      0,
      params.height - params.fontHeight,
      params.width,
      params.fontHeight,
      data,
      'center'
    )];
  }

  /**
   * Expand a bit-encoded integer into `count` bars, least significant bit
   * first — the order the symbol tables are written in.
   */
  add(data: number, count: number): boolean[] {
    const bits: boolean[] = [];
    for (let i = 0; i < count; i++) {
      bits.push((1 & (data >> i)) === 1);
    }
    return bits;
  }

  /** A hexadecimal digest of the bars, for comparing against upstream. */
  toHex(data: string): string {
    let intermediate = '';
    for (const bit of this.convert(data)) {
      intermediate += bit ? '1' : '0';
    }

    let result = '';
    while (intermediate.length > 8) {
      const sub = intermediate.substring(intermediate.length - 8);
      result += parseInt(sub, 2).toString(16);
      intermediate = intermediate.substring(0, intermediate.length - 8);
    }
    result += parseInt(intermediate, 2).toString(16);

    return result;
  }

  /** The text this barcode would draw, for comparing against upstream. */
  getText(data: string): string {
    let result = '';

    const params: BarcodeDrawParams = {
      drawText: true,
      width: 200,
      height: 200,
      fontHeight: 10,
      textPadding: 5
    };

    for (const element of this.makeText(data, params, 10)) {
      if (element instanceof BarcodeText) {
        result += element.text;
      }
    }

    return result;
  }

  /**
   * The actual symbology: the presence or absence of a bar, one entry per
   * module, at the narrowest module width.
   */
  abstract convert(data: string): boolean[];
}

/** Fill in the optional halves of [BarcodeMakeOptions]. */
export function drawParams(options: BarcodeMakeOptions): BarcodeDrawParams {
  if (!(options.width > 0) || !(options.height > 0)) {
    throw new RangeError('A barcode needs a positive width and height');
  }

  return {
    drawText: options.drawText ?? false,
    width: options.width,
    height: options.height,
    fontHeight: options.fontHeight ?? 0,
    textPadding: options.textPadding ?? DEFAULT_TEXT_PADDING
  };
}
