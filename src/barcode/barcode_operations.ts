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
 *   - barcode/lib/src/barcode_operations.dart
 *
 * The drawing operations a barcode reduces to. A generator emits nothing but
 * these, which is what keeps the symbologies free of any rendering concern.
 */

/** A [Barcode] drawing operation. */
export class BarcodeElement {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;

  constructor(left: number, top: number, width: number, height: number) {
    this.left = left;
    this.top = top;
    this.width = width;
    this.height = height;
  }

  get right(): number {
    return this.left + this.width;
  }

  get bottom(): number {
    return this.top + this.height;
  }
}

/** A rectangle: one white or black unit of the symbol. */
export class BarcodeBar extends BarcodeElement {
  /** Whether this rectangle is black. */
  readonly black: boolean;

  constructor(left: number, top: number, width: number, height: number, black: boolean) {
    super(left, top, width, height);
    this.black = black;
  }
}

/** Text alignment inside a [BarcodeText] zone. */
export type BarcodeTextAlign = 'left' | 'center' | 'right';

/** A text drawing operation. */
export class BarcodeText extends BarcodeElement {
  /** Text to display in this rectangle. */
  readonly text: string;

  /** Where the text sits inside its rectangle. */
  readonly align: BarcodeTextAlign;

  constructor(
    left: number,
    top: number,
    width: number,
    height: number,
    text: string,
    align: BarcodeTextAlign
  ) {
    super(left, top, width, height);
    this.text = text;
    this.align = align;
  }
}
