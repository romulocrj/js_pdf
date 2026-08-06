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
 *   - barcode/lib/src/barcode_hm.dart
 *
 * Height-modulated symbologies — the postal ones — encode in a bar's ascender
 * and descender rather than in its width, so they place every bar themselves
 * instead of going through `Barcode1D`'s run coalescing.
 */

import { utf8Decode } from '../base/utf8.ts';
import type { BarcodeMakeOptions } from './barcode.ts';
import { Barcode1D, drawParams } from './barcode_1d.ts';
import { BarcodeBar } from './barcode_operations.ts';
import type { BarcodeElement } from './barcode_operations.ts';

/**
 * The bar modulation type.
 *
 * The numeric values are load-bearing: `fromBits` reads two bits straight out
 * of the symbol table and uses them as an index, exactly as upstream indexes
 * `BarcodeHMBar.values`.
 */
export const BarcodeHMBar = {
  /** No ascender and no descender. */
  tracker: 0,
  /** Ascender only. */
  ascender: 1,
  /** Descender only. */
  descender: 2,
  /** Both ascender and descender. */
  full: 3
} as const;

export type BarcodeHMBar = (typeof BarcodeHMBar)[keyof typeof BarcodeHMBar];

/** Height-modulated barcode generation class. */
export abstract class BarcodeHM extends Barcode1D {
  private readonly trackerRatio: number;

  constructor(tracker = 0.3) {
    super();
    this.trackerRatio = tracker;
  }

  override makeBytes(data: Uint8Array, options: BarcodeMakeOptions): BarcodeElement[] {
    const params = drawParams(options);
    const result: BarcodeElement[] = [];

    const text = utf8Decode(data);
    const bars = this.convertHM(text);

    if (bars.length === 0) {
      return result;
    }

    const top = this.marginTop(params);
    const left = this.marginLeft(params);
    const right = this.marginRight(params);
    const lineWidth = (params.width - left - right) / (bars.length * 2 - 1);

    const barHeight = params.height
      - (params.drawText ? params.fontHeight + params.textPadding : 0)
      - top;
    const tracker = barHeight * this.trackerRatio;

    let index = 0;
    for (const bar of bars) {
      switch (bar) {
        case BarcodeHMBar.tracker:
          result.push(new BarcodeBar(
            left + index * 2 * lineWidth,
            top + barHeight / 2 - tracker / 2,
            lineWidth,
            tracker,
            true
          ));
          break;
        case BarcodeHMBar.ascender:
          result.push(new BarcodeBar(
            left + index * 2 * lineWidth,
            top,
            lineWidth,
            barHeight / 2 + tracker / 2,
            true
          ));
          break;
        case BarcodeHMBar.descender:
          result.push(new BarcodeBar(
            left + index * 2 * lineWidth,
            top + barHeight / 2 - tracker / 2,
            lineWidth,
            barHeight / 2 + tracker / 2,
            true
          ));
          break;
        case BarcodeHMBar.full:
          result.push(new BarcodeBar(
            left + index * 2 * lineWidth,
            top,
            lineWidth,
            barHeight,
            true
          ));
          break;
      }

      index++;
    }

    if (params.drawText) {
      result.push(...this.makeText(text, params, lineWidth));
    }

    return result;
  }

  override toHex(data: string): string {
    let result = '';
    let b = 0;
    let n = false;
    for (const bit of this.convertHM(data)) {
      b = (b << 2) + bit;
      if (n) {
        result += b.toString(16);
        b = 0;
      }
      n = !n;
    }
    return result;
  }

  /** Read two bits as a bar type. */
  fromBits(bits: number): BarcodeHMBar {
    return (bits & 3) as BarcodeHMBar;
  }

  /** Expand a bit-encoded integer into `len` bar types, two bits each. */
  addHW(code: number, len: number): BarcodeHMBar[] {
    const bars: BarcodeHMBar[] = [];
    for (let index = 0; index < len; index++) {
      bars.push(this.fromBits((code >> (index * 2)) & 3));
    }
    return bars;
  }

  override convert(_data: string): boolean[] {
    throw new Error('A height-modulated barcode has no two-state bars');
  }

  /** The actual symbology: one modulation per bar. */
  abstract convertHM(data: string): BarcodeHMBar[];
}
