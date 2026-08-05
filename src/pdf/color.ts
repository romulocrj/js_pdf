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
 *   - pdf/lib/src/pdf/color.dart
 */

import { clamp } from '../base/assert.ts';
import { formatNumber } from './format/num.ts';

/** A normalized DeviceRGB triple, each component in 0..1. */
export type Rgb = readonly [number, number, number];

/** `#RRGGBB`, or an `[r, g, b]` triple already in 0..1. */
export type ColorInput = string | Rgb;

/**
 * Upstream models color as the `PdfColor` value type with CMYK and HSL
 * subclasses; the port keeps DeviceRGB as the only color space.
 */
export function normalizeColor(value: ColorInput | null | undefined, fallback: Rgb = [0, 0, 0]): Rgb {
  if (value == null) return fallback;

  if (Array.isArray(value)) {
    const [r, g, b] = value as Rgb;
    return [clamp(Number(r), 0, 1), clamp(Number(g), 0, 1), clamp(Number(b), 0, 1)];
  }

  if (typeof value === 'string') {
    const hex = value.startsWith('#') ? value.slice(1) : value;
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      return [
        parseInt(hex.slice(0, 2), 16) / 255,
        parseInt(hex.slice(2, 4), 16) / 255,
        parseInt(hex.slice(4, 6), 16) / 255
      ];
    }
  }

  throw new TypeError('Color must be [r,g,b] with values from 0 to 1 or #RRGGBB');
}

/** The `rg` (non-stroking) or `RG` (stroking) color operator. */
export function colorOperator(color: ColorInput, stroke = false): string {
  const [r, g, b] = normalizeColor(color);
  return `${formatNumber(r)} ${formatNumber(g)} ${formatNumber(b)} ${stroke ? 'RG' : 'rg'}`;
}
