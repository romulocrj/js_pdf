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
 *   - pdf/lib/src/pdf/format/num.dart
 *
 * Upstream rounds to 5 decimals; the port rounds to 4. That is a deliberate
 * divergence, not an oversight: content streams are written by `formatNumber`
 * already and changing the precision would move every coordinate in every
 * fixture. Revisit only with a reason to churn the output.
 */

import { PdfDataType } from './base.ts';
import type { PdfStream } from './stream.ts';

/**
 * Serialize a number the way PDF operators expect: no exponent notation, no
 * trailing zeros, and no negative zero.
 */
export function formatNumber(value: number): string {
  const rounded = Math.abs(value) < 0.000001 ? 0 : value;
  return Number(rounded.toFixed(4)).toString();
}

/** A PDF numeric object. */
export class PdfNum extends PdfDataType {
  readonly value: number;

  constructor(value: number) {
    super();
    this.value = value;
  }

  override output(s: PdfStream): void {
    s.putString(formatNumber(this.value));
  }
}

/**
 * A bare run of space-separated numbers — the operand form used inside content
 * streams and by matrix-valued dictionary entries. Not an array: it emits no
 * brackets.
 */
export class PdfNumList extends PdfDataType {
  readonly values: readonly number[];

  constructor(values: readonly number[]) {
    super();
    this.values = values;
  }

  override output(s: PdfStream): void {
    s.putString(this.values.map(formatNumber).join(' '));
  }
}
