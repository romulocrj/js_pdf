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
 *   - pdf/lib/src/svg/color.dart
 *
 * How a `fill` or `stroke` attribute becomes a colour — or, for `none`, becomes
 * the decision not to paint at all.
 *
 * `none` and `unknown` are both "empty" and both mean *do not paint*, but they
 * are different values: `none` was asked for, `unknown` is what the port fell
 * back to when it could not read the attribute. Keeping them apart is what lets
 * an unsupported paint degrade to nothing drawn rather than to black.
 *
 * Gradient references are resolved by `SvgBrush`, which has the document tree
 * needed to distinguish a gradient URL from another paint server.
 */

import { normalizeColor } from '../pdf/color.ts';
import type { Rgb } from '../pdf/color.ts';
import type { PdfCanvas } from '../pdf/graphics.ts';
import type { SvgOperation } from './operation.ts';
import { svgColors } from './colors.ts';
import { splitNumeric } from './parser.ts';
import type { SvgParser } from './parser.ts';

/** HSL to RGB, all inputs in 0..1. Upstream gets this from `PdfColorHsl`. */
function hslToRgb(hue: number, saturation: number, lightness: number): Rgb {
  const h = ((hue % 1) + 1) % 1;
  const s = Math.min(1, Math.max(0, saturation));
  const l = Math.min(1, Math.max(0, lightness));

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c / 2;

  const sector = Math.floor(h * 6);
  const table: readonly Rgb[] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x]
  ];
  const [r, g, b] = table[sector % 6]!;
  return [r + m, g + m, b + m];
}

/** The comma- or space-separated operands of `rgb(…)`, `rgba(…)`, `hsl(…)`. */
function functionArguments(value: string): string {
  return value.slice(value.indexOf('(') + 1, value.lastIndexOf(')'));
}

export class SvgColor {
  readonly color: Rgb | null;

  /** Alpha carried by functional colour syntax; multiplied into paint opacity. */
  readonly opacity: number;

  /** True for an absent attribute: the parent's paint applies. */
  readonly inherit: boolean;

  constructor(color: Rgb | null = null, inherit = false, opacity = 1) {
    this.color = color;
    this.inherit = inherit;
    this.opacity = opacity;
  }

  /** Read but not understood — treated as "do not paint". */
  static readonly unknown = new SvgColor();

  /** What an SVG paints with when nothing said otherwise. */
  static readonly defaultColor = new SvgColor([0, 0, 0]);

  /** `fill="none"`. */
  static readonly none = new SvgColor();

  /** No attribute at all. */
  static readonly inherited = new SvgColor(null, true);

  get isEmpty(): boolean {
    return this.color === null;
  }

  get isNotEmpty(): boolean {
    return !this.isEmpty;
  }

  merge(other: SvgColor): SvgColor {
    return new SvgColor(other.color ?? this.color, false, other.color === null ? this.opacity : other.opacity);
  }

  setFillColor(_operation: SvgOperation, canvas: PdfCanvas): void {
    if (this.color !== null) {
      canvas.setFillColor(this.color);
    }
  }

  setStrokeColor(_operation: SvgOperation, canvas: PdfCanvas): void {
    if (this.color !== null) {
      canvas.setStrokeColor(this.color);
    }
  }

  static fromXml(
    color: string | null | undefined,
    parser: SvgParser,
    currentColor: SvgColor = SvgColor.defaultColor
  ): SvgColor {
    if (color === null || color === undefined) {
      return SvgColor.inherited;
    }

    const value = color.trim();

    if (value === 'none') {
      return SvgColor.none;
    }

    if (value.toLowerCase() === 'currentcolor') {
      return currentColor;
    }

    // A colour filter overrides the document, which is how upstream tints a
    // monochrome icon without editing its markup.
    if (parser.colorFilter !== null) {
      return new SvgColor(parser.colorFilter);
    }

    const lower = value.toLowerCase();

    // Upstream's table gives `transparent` six hex digits, so it painted
    // opaque white; it is black at alpha 0, which paints nothing.
    if (lower === 'transparent') {
      return new SvgColor([0, 0, 0], false, 0);
    }

    const named = svgColors[lower];
    if (named !== undefined) {
      return new SvgColor(normalizeColor(named));
    }

    // Alpha, from any syntax, is carried as `opacity` and folded by the painter
    // into fill-opacity or stroke-opacity; the canvas always gets an opaque
    // colour, so a graphics layer that honours colour alpha cannot apply it
    // twice.
    if (/^(rgb|hsl)a?\s*\(/.test(lower)) {
      try {
        const parts = splitNumeric(functionArguments(value), null);
        const [first, second, third, alpha] = parts;
        if (third === undefined || parts.some(part => part.unit !== 'direct' && part.unit !== 'percent')) {
          return SvgColor.unknown;
        }
        // Hue is in degrees; upstream divided it by 255.
        const rgb: Rgb = lower.startsWith('hsl')
          ? hslToRgb(first!.unit === 'percent' ? first!.value / 100 : first!.value / 360, second!.colorValue, third.colorValue)
          : [first!.colorValue, second!.colorValue, third.colorValue];
        const opacity = alpha === undefined ? 1 : alpha.unit === 'percent' ? alpha.value / 100 : alpha.value;
        return new SvgColor(rgb, false, Math.min(1, Math.max(0, opacity)));
      } catch {
        // An operand that is not a number, or a length unit, is invalid paint
        // rather than an exception out of the document (upstream threw).
        return SvgColor.unknown;
      }
    }

    if (lower.startsWith('url(')) {
      // `SvgBrush` resolves a paint server first; reaching here means it could
      // not be, so the fallback colour after the reference applies.
      const fallback = value.slice(value.indexOf(')') + 1).trim();
      return fallback === '' || !value.includes(')')
        ? SvgColor.unknown
        : SvgColor.fromXml(fallback, parser, currentColor);
    }

    // `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` (and the six or eight digits bare).
    const hex = /^(?:#([0-9a-f]{3,4})|#?([0-9a-f]{6}|[0-9a-f]{8}))$/.exec(lower);
    if (hex === null) {
      // Upstream prints the unknown colour and carries on. The port has no
      // console under ClearScript, so it carries on silently — the shape simply
      // does not paint, which is visible enough.
      return SvgColor.unknown;
    }
    const digits = hex[2] ?? hex[1]!.replace(/./g, '$&$&');
    const byte = (index: number): number => parseInt(digits.slice(index, index + 2), 16) / 255;
    return new SvgColor([byte(0), byte(2), byte(4)], false, digits.length > 6 ? byte(6) : 1);
  }
}
