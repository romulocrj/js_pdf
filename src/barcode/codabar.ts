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
 *   - barcode/lib/src/codabar.dart
 */

import { codeUnits } from '../base/utf8.ts';
import { Barcode1D } from './barcode_1d.ts';
import type { BarcodeDrawParams } from './barcode_1d.ts';
import { BarcodeException } from './barcode_exception.ts';
import { BarcodeMaps } from './barcode_maps.ts';
import type { BarcodeElement } from './barcode_operations.ts';

/**
 * The start and stop symbols Codabar allows.
 *
 * The numeric values are load-bearing: they index the start/stop table and
 * offset from 'A', as upstream's enum indices do.
 */
export const BarcodeCodabarStartStop = {
  /** A, or E. */
  A: 0,
  /** B, or N. */
  B: 1,
  /** C, or `*`. */
  C: 2,
  /** D, or T. */
  D: 3
} as const;

export type BarcodeCodabarStartStop =
  (typeof BarcodeCodabarStartStop)[keyof typeof BarcodeCodabarStartStop];

/**
 * Codabar barcode.
 *
 * Designed to survive a dot-matrix printer, which is why it is still found on
 * airbills and blood bank forms.
 */
export class BarcodeCodabar extends Barcode1D {
  readonly start: BarcodeCodabarStartStop;
  readonly stop: BarcodeCodabarStartStop;

  /** Print the start and stop characters under the bars. */
  readonly printStartStop: boolean;

  /**
   * Take the start and stop characters from the data itself, as letters
   * (ABCDETN*). [start] and [stop] are then ignored.
   */
  readonly explicitStartStop: boolean;

  constructor(
    start: BarcodeCodabarStartStop,
    stop: BarcodeCodabarStartStop,
    printStartStop: boolean,
    explicitStartStop: boolean
  ) {
    super();
    this.start = start;
    this.stop = stop;
    this.printStartStop = printStartStop;
    this.explicitStartStop = explicitStartStop;
  }

  override get charSet(): Iterable<number> {
    return [...BarcodeMaps.codabar.keys()].filter(x => x < 0x40);
  }

  override get name(): string {
    return 'CODABAR';
  }

  override convert(data: string): boolean[] {
    const startStop = [0x41, 0x42, 0x43, 0x44];

    let lStart = startStop[this.start] as number;
    let lStop = startStop[this.stop] as number;

    if (this.explicitStartStop) {
      lStart = startStopByte(data.charCodeAt(0));
      lStop = startStopByte(data.charCodeAt(data.length - 1));
      data = data.substring(1, data.length - 1);
    }

    const bits: boolean[] = [];

    // Start
    bits.push(...this.add(
      BarcodeMaps.codabar.get(lStart) as number,
      BarcodeMaps.codabarLen.get(lStart) as number
    ));

    // Space between characters
    bits.push(false);

    for (const code of codeUnits(data)) {
      if (code > 0x40 || code === 0x2a) {
        throw new BarcodeException(
          `Unable to encode "${String.fromCharCode(code)}" to ${this.name} Barcode`
        );
      }

      const codeValue = BarcodeMaps.codabar.get(code);
      if (codeValue === undefined) {
        throw new BarcodeException(
          `Unable to encode "${String.fromCharCode(code)}" to ${this.name} Barcode`
        );
      }
      bits.push(...this.add(codeValue, BarcodeMaps.codabarLen.get(code) as number));

      // Space between characters
      bits.push(false);
    }

    // Stop
    bits.push(...this.add(
      BarcodeMaps.codabar.get(lStop) as number,
      BarcodeMaps.codabarLen.get(lStop) as number
    ));

    return bits;
  }

  override verifyBytes(data: Uint8Array): void {
    if (this.explicitStartStop) {
      const validStartStop = [0x41, 0x42, 0x43, 0x44, 0x4e, 0x54, 0x2a, 0x45];

      if (data.length < 3) {
        throw new BarcodeException(
          `Unable to encode ${this.name} Barcode: missing start and/or stop chars`
        );
      }

      if (!validStartStop.includes(data[0] as number)) {
        throw new BarcodeException(
          `Unable to encode ${this.name} Barcode: "${String.fromCharCode(data[0] as number)}" is an invalid start char`
        );
      }

      const lastByte = data[data.length - 1] as number;
      if (!validStartStop.includes(lastByte)) {
        throw new BarcodeException(
          `Unable to encode ${this.name} Barcode: "${String.fromCharCode(lastByte)}" is an invalid start char`
        );
      }

      data = data.subarray(1, data.length - 1);
    }

    super.verifyBytes(data);
  }

  override makeText(data: string, params: BarcodeDrawParams, lineWidth: number): BarcodeElement[] {
    if (this.printStartStop && !this.explicitStartStop) {
      data = String.fromCharCode(this.start + 0x41)
        + data
        + String.fromCharCode(this.stop + 0x41);
    } else if (!this.printStartStop && this.explicitStartStop) {
      data = data.substring(1, data.length - 1);
    }

    return super.makeText(data, params, lineWidth);
  }
}

/** Map the alternate spellings of the start/stop letters onto A-D. */
function startStopByte(value: number): number {
  switch (value) {
    case 0x54: return 0x41; // T
    case 0x4e: return 0x42; // N
    case 0x2a: return 0x43; // *
    case 0x45: return 0x44; // E
    default: return value;
  }
}
