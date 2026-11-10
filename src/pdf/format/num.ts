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
 * The largest magnitude written: the largest finite single-precision float,
 * which is as much as a reader has to cope with. From upstream #1980.
 */
const LIMIT = 3.403e38;

/**
 * Serialize a number the way PDF operators expect: no exponent notation, no
 * trailing zeros, and no negative zero.
 *
 * ISO 32000-1 7.3.3 has syntax for none of `NaN`, `Infinity` or an exponent,
 * and a reader drops the whole operator or dictionary entry that holds one. As
 * upstream #1980 does, a non-finite value writes `0` and anything from 1e21 up
 * (where the built-in conversion switches to exponents) writes plain integer
 * digits, clamped to `LIMIT`. Every finite value below 1e21 is unchanged.
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1e21) return BigInt(Math.min(LIMIT, Math.max(-LIMIT, value))).toString();
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
