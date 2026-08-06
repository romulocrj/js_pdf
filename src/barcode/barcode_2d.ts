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
 *   - barcode/lib/src/barcode_2d.dart
 *
 * A two-dimensional symbology reduces to a matrix of modules; this class fits
 * that matrix into the requested box and coalesces each row's runs into as few
 * rectangles as it can.
 */

import { Barcode } from './barcode.ts';
import type { BarcodeMakeOptions } from './barcode.ts';
import { BarcodeException } from './barcode_exception.ts';
import { BarcodeBar } from './barcode_operations.ts';
import type { BarcodeElement } from './barcode_operations.ts';

/** The raw module matrix of a 2D barcode. */
export class Barcode2DMatrix {
  readonly width: number;
  readonly height: number;

  /** The module aspect ratio (width over height). */
  readonly ratio: number;

  readonly pixels: readonly boolean[];

  constructor(width: number, height: number, ratio: number, pixels: readonly boolean[]) {
    this.width = width;
    this.height = height;
    this.ratio = ratio;
    this.pixels = pixels;
  }

  /** Build a matrix by asking a callback about each module. */
  static fromXY(
    width: number,
    height: number,
    ratio: number,
    isDark: (x: number, y: number) => boolean
  ): Barcode2DMatrix {
    const pixels: boolean[] = [];
    for (let p = 0; p < width * height; p++) {
      const x = p % width;
      const y = Math.floor(p / width);
      pixels.push(isDark(x, y));
    }
    return new Barcode2DMatrix(width, height, ratio, pixels);
  }
}

/** Two-dimensional barcode generation class. */
export abstract class Barcode2D extends Barcode {
  override makeBytes(data: Uint8Array, options: BarcodeMakeOptions): BarcodeElement[] {
    const { width, height } = options;
    if (!(width > 0) || !(height > 0)) {
      throw new RangeError('A barcode needs a positive width and height');
    }

    const matrix = this.convert(data);
    const result: BarcodeElement[] = [];

    // Center the barcode
    const mh = matrix.height * matrix.ratio;
    let w: number;
    let h: number;
    if (width / height > matrix.width / mh) {
      w = (matrix.width * height) / mh;
      h = height;
    } else {
      w = width;
      h = (mh * width) / matrix.width;
    }

    const pixelW = w / matrix.width;
    const pixelH = h / matrix.height;
    const offsetX = (width - w) / 2;
    const offsetY = (height - h) / 2;

    let start = 0;
    let color: boolean | null = null;
    let x = 0;
    let y = 0;

    for (const pixel of matrix.pixels) {
      if (color === null) color = pixel;

      if (pixel !== color) {
        result.push(new BarcodeBar(
          offsetX + start * pixelW,
          offsetY + y * pixelH,
          (x - start) * pixelW,
          pixelH,
          color
        ));

        color = pixel;
        start = x;
      }

      x++;
      if (x >= matrix.width) {
        result.push(new BarcodeBar(
          offsetX + start * pixelW,
          offsetY + y * pixelH,
          (matrix.width - start) * pixelW,
          pixelH,
          color
        ));
        color = null;
        start = 0;
        x = 0;
        y++;
      }
    }

    return result;
  }

  override verifyBytes(data: Uint8Array): void {
    super.verifyBytes(data);

    try {
      this.convert(data);
    } catch (error) {
      throw new BarcodeException(String(error));
    }
  }

  /** A hexadecimal digest of the modules, for comparing against upstream. */
  toHex(data: string): string {
    let intermediate = '';
    const codeUnits = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) codeUnits[i] = data.charCodeAt(i) & 0xff;

    for (const bit of this.convert(codeUnits).pixels) {
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

  /** The actual symbology: which modules are dark. */
  abstract convert(data: Uint8Array): Barcode2DMatrix;
}
