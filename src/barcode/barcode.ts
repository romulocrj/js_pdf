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
 *   - barcode/lib/src/barcode.dart
 *   - barcode/lib/src/barcode_types.dart
 *
 * `widgets/barcode.dart` delegates the whole of its symbol generation to
 * David PHAM-VAN's separate `barcode` package. That package is ported here,
 * under `src/barcode/`, file for file against `barcode/lib/src/`.
 *
 * Two things are different across the whole directory, and are not repeated in
 * every file:
 *
 *   1. **Every generator returns an array, where upstream returns a lazy
 *      `Iterable` from a `sync*` function.** A Dart `Iterable` can be walked
 *      more than once, and upstream does exactly that — PDF417's high-level
 *      encoder reads its result's length and then its contents. A JavaScript
 *      generator is single-shot, so materializing is the faithful translation,
 *      not the lossy one.
 *   2. **The static factories live in `barcode_factory.ts`, not here.** They
 *      construct the concrete symbologies, which extend this class; keeping
 *      both in one file would make the module graph circular, and unlike Dart,
 *      an ES module cycle leaves the base class uninitialized at the point a
 *      subclass needs to extend it. `index.ts` re-exports the factory as the
 *      value `Barcode` and this class as the type of the same name, so the
 *      public API still reads `Barcode.pdf417()`.
 */

import { utf8Encode } from '../base/utf8.ts';
import { BarcodeException } from './barcode_exception.ts';
import { BarcodeBar, BarcodeText } from './barcode_operations.ts';
import type { BarcodeElement } from './barcode_operations.ts';

/** Supported barcode types. */
export type BarcodeType =
  | 'CodeITF16'
  | 'CodeITF14'
  | 'CodeEAN13'
  | 'CodeEAN8'
  | 'CodeEAN5'
  | 'CodeEAN2'
  | 'CodeISBN'
  | 'Code39'
  | 'Code93'
  | 'CodeUPCA'
  | 'CodeUPCE'
  | 'Code128'
  | 'GS128'
  | 'Telepen'
  | 'QrCode'
  | 'Codabar'
  | 'PDF417'
  | 'DataMatrix'
  | 'Aztec'
  | 'Rm4scc'
  | 'Postnet'
  | 'Itf';

/** Options accepted by [Barcode.make] and [Barcode.makeBytes]. */
export interface BarcodeMakeOptions {
  readonly width: number;
  readonly height: number;
  readonly drawText?: boolean;
  readonly fontHeight?: number | null;
  readonly textPadding?: number | null;
}

/** Options accepted by [Barcode.toSvg]. */
export interface BarcodeSvgOptions {
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly drawText?: boolean;
  readonly fontFamily?: string;
  readonly fontHeight?: number | null;
  readonly textPadding?: number | null;
  readonly color?: number;
  readonly fullSvg?: boolean;
  readonly baseline?: number;
}

const INFINITE_MAX_LENGTH = 1000;
const SVG_NAMESPACE = `http:${String.fromCharCode(47, 47)}www.w3.org/2000/svg`;

/** Barcode generation class. */
export abstract class Barcode {
  /**
   * Produce the barcode graphic description: the drawing operations required
   * to display the barcode for a string.
   */
  make(data: string, options: BarcodeMakeOptions): BarcodeElement[] {
    return this.makeBytes(utf8Encode(data), options);
  }

  /** As [make], but taking bytes the caller already has. */
  abstract makeBytes(data: Uint8Array, options: BarcodeMakeOptions): BarcodeElement[];

  /** Whether this barcode can encode the data. */
  isValid(data: string): boolean {
    try {
      this.verify(data);
    } catch {
      return false;
    }
    return true;
  }

  /** Whether this barcode can encode the bytes. */
  isValidBytes(data: Uint8Array): boolean {
    try {
      this.verifyBytes(data);
    } catch {
      return false;
    }
    return true;
  }

  /** Throws a [BarcodeException] naming the reason the data cannot be encoded. */
  verify(data: string): void {
    this.verifyBytes(utf8Encode(data));
  }

  /** Throws a [BarcodeException] naming the reason the bytes cannot be encoded. */
  verifyBytes(data: Uint8Array): void {
    if (data.length > this.maxLength) {
      throw new BarcodeException(
        `Unable to encode "${data}", maximum length is ${this.maxLength} for ${this.name} Barcode`
      );
    }

    if (data.length < this.minLength) {
      throw new BarcodeException(
        `Unable to encode "${data}", minimum length is ${this.minLength} for ${this.name} Barcode`
      );
    }

    const chr = new Set(this.charSet);

    for (const code of data) {
      if (!chr.has(code)) {
        throw new BarcodeException(
          `Unable to encode "${String.fromCharCode(code)}" to ${this.name} Barcode`
        );
      }
    }
  }

  /** Render this barcode to an SVG document, from string data. */
  toSvg(data: string, options: BarcodeSvgOptions = {}): string {
    return this.toSvgBytes(utf8Encode(data), options);
  }

  /** Render this barcode to an SVG document, from bytes. */
  toSvgBytes(data: Uint8Array, options: BarcodeSvgOptions = {}): string {
    const {
      x = 0,
      y = 0,
      width = 200,
      height = 80,
      drawText = true,
      fontFamily = 'monospace',
      color = 0x000000,
      fullSvg = true,
      baseline = 0.75
    } = options;

    const fontHeight = options.fontHeight ?? height * 0.2;
    const textPadding = options.textPadding ?? height * 0.05;

    const recipe = this.makeBytes(data, { width, height, drawText, fontHeight, textPadding });

    let path = '';
    let tSpan = '';

    for (const element of recipe) {
      if (element instanceof BarcodeBar) {
        if (element.black) {
          path += `M ${d(x + element.left)} ${d(y + element.top)} `;
          path += `h ${d(element.width)} `;
          path += `v ${d(element.height)} `;
          path += `h ${d(-element.width)} `;
          path += 'z ';
        }
      } else if (element instanceof BarcodeText) {
        const lY = y + element.top + element.height * baseline;

        let lX: number;
        let anchor: string;
        switch (element.align) {
          case 'left':
            lX = x + element.left;
            anchor = 'start';
            break;
          case 'center':
            lX = x + element.left + element.width / 2;
            anchor = 'middle';
            break;
          case 'right':
            lX = x + element.left + element.width;
            anchor = 'end';
            break;
        }

        tSpan += `<tspan style="text-anchor: ${anchor}" x="${d(lX)}" y="${d(lY)}">${escape(element.text)}</tspan>`;
      }
    }

    let output = '';
    if (fullSvg) {
      output += `<svg viewBox="${d(x)} ${d(y)} ${d(width)} ${d(height)}" xmlns="${SVG_NAMESPACE}">`;
    }

    output += `<path d="${path}" style="fill: ${hex(color)}"/>`;
    output += `<text style="fill: ${hex(color)}; font-family: &quot;${escape(fontFamily)}&quot;; `
      + `font-size: ${d(fontHeight)}px" x="${d(x)}" y="${d(y)}">${tSpan}</text>`;

    if (fullSvg) {
      output += '</svg>';
    }

    return output;
  }

  /** The code points this barcode accepts. */
  abstract get charSet(): Iterable<number>;

  /** The name of this barcode. */
  abstract get name(): string;

  /** The greatest number of characters this barcode can encode. */
  get maxLength(): number {
    return INFINITE_MAX_LENGTH;
  }

  /** The least number of characters this barcode can encode. */
  get minLength(): number {
    return 1;
  }

  toString(): string {
    return `Barcode ${this.name}`;
  }
}

function d(value: number): string {
  return value.toFixed(5);
}

function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hex(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}
