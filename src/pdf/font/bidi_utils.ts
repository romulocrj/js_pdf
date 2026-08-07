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
 *   - pdf/lib/src/pdf/font/bidi_utils.dart
 */

import { shapeArabicLogical } from './arabic.ts';
import { reorderUnicodeBidi } from './unicode_bidi.ts';

export const basicToIsolatedMappings: ReadonlyMap<number, number> = new Map([
  [0x0627, 0xfe8d], [0x0628, 0xfe8f], [0x062a, 0xfe95], [0x062b, 0xfe99],
  [0x062c, 0xfe9d], [0x062d, 0xfea1], [0x062e, 0xfea5], [0x062f, 0xfea9],
  [0x0630, 0xfeab], [0x0631, 0xfead], [0x0632, 0xfeaf], [0x0633, 0xfeb1],
  [0x0634, 0xfeb5], [0x0635, 0xfeb9], [0x0636, 0xfebd], [0x0637, 0xfec1],
  [0x0638, 0xfec5], [0x0639, 0xfec9], [0x063a, 0xfecd], [0x0641, 0xfed1],
  [0x0642, 0xfed5], [0x0643, 0xfed9], [0x0644, 0xfedd], [0x0645, 0xfee1],
  [0x0646, 0xfee5], [0x0647, 0xfee9], [0x0648, 0xfeed], [0x064a, 0xfeef],
  [0x0621, 0xfe80], [0x0622, 0xfe81], [0x0623, 0xfe83], [0x0624, 0xfe85],
  [0x0625, 0xfe87], [0x0626, 0xfe89], [0x0629, 0xfe93]
]);

/** Convert logical RTL paragraphs into the visual runs consumed by PDF text. */
export function logicalToVisual(input: string): string {
  return input
    .split('\n')
    // Dart's bidi package needs an additional word-order compensation here.
    // This implementation already returns final visual order; applying that
    // compensation again would reverse an entirely Latin run in an RTL scope.
    .map(line => reorderUnicodeBidi(shapeArabicLogical(line), 'rtl'))
    .join('\n');
}
