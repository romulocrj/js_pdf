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
 *   - pdf/lib/src/pdf/color.dart
 */

import { clamp } from '../base/assert.ts';
import { formatNumber } from './format/num.ts';

/** A normalized DeviceRGB triple, each component in 0..1. */
export type Rgb = readonly [number, number, number];

/** A color value, `#RRGGBB`, or an `[r, g, b]` triple already in 0..1. */
export type ColorInput = string | Rgb | PdfColor;

/** Convert inputs to RGB for algorithms whose color space is explicitly RGB. */
export function normalizeColor(value: ColorInput | null | undefined, fallback: Rgb = [0, 0, 0]): Rgb {
  if (value == null) return fallback;
  if (value instanceof PdfColor) return [value.red, value.green, value.blue];

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

function linearizeColorComponent(component: number): number {
  if (component <= 0.03928) return component / 12.92;
  return Math.pow((component + 0.055) / 1.055, 2.4);
}

/** Upstream `PdfColor.luminance`: the WCAG relative luminance of a color. */
export function colorLuminance(color: ColorInput): number {
  const [r, g, b] = normalizeColor(color);
  return 0.2126 * linearizeColorComponent(r)
    + 0.7152 * linearizeColorComponent(g)
    + 0.0722 * linearizeColorComponent(b);
}

/**
 * Upstream `PdfColor.isLight`, quirk included: the test is
 * `(luminance + .05)² > .15`, which puts the cut at a luminance near .337 and
 * not the .5 the name suggests. Chart labels choose their color with this, so
 * the threshold is rendered output, not taste.
 */
export function isLightColor(color: ColorInput): boolean {
  const relative = colorLuminance(color) + 0.05;
  return !(relative * relative > 0.15);
}

/** Select the RGB, gray or CMYK fill/stroke operator without applying alpha. */
export function colorOperator(color: ColorInput, stroke = false): string {
  const operator = color instanceof PdfColorCmyk ? (stroke ? 'K' : 'k')
    : color instanceof PdfColorGrey ? (stroke ? 'G' : 'g') : (stroke ? 'RG' : 'rg');
  return `${colorComponents(color).map(formatNumber).join(' ')} ${operator}`;
}

/** Validate the normalized component contract without silently changing values. */
function unit(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError('Color components must be finite values in 0..1');
  return value;
}

function hueValue(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value >= 360) throw new RangeError('Hue must be in 0..360, excluding 360');
  return value;
}

function wrapHue(value: number): number { return ((value % 360) + 360) % 360; }

/** RGB color value; alpha is retained for composition, not applied by color operators. */
export class PdfColor {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha: number;

  constructor(red: number, green: number, blue: number, alpha = 1) {
    this.red = unit(red); this.green = unit(green); this.blue = unit(blue); this.alpha = unit(alpha);
  }

  static fromInt(color: number): PdfColor {
    return new PdfColor(((color >>> 16) & 255) / 255, ((color >>> 8) & 255) / 255, (color & 255) / 255, ((color >>> 24) & 255) / 255);
  }

  static fromHex(color: string): PdfColor {
    const hex = color.startsWith('#') ? color.slice(1) : color;
    if (!/^(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(hex)) throw new TypeError('Color hex must contain 3, 6 or 8 hexadecimal digits');
    const expanded = hex.length === 3 ? [...hex].map(value => value + value).join('') : hex;
    return new PdfColor(parseInt(expanded.slice(0, 2), 16) / 255, parseInt(expanded.slice(2, 4), 16) / 255,
      parseInt(expanded.slice(4, 6), 16) / 255, expanded.length === 8 ? parseInt(expanded.slice(6), 16) / 255 : 1);
  }

  static fromRYB(red: number, yellow: number, blue: number, alpha = 1): PdfColor {
    unit(red); unit(yellow); unit(blue);
    const magic: readonly Rgb[] = [[1,1,1], [1,1,0], [1,0,0], [1,0.5,0], [0.163,0.373,0.6], [0,0.66,0.2], [0.5,0,0.5], [0.2,0.094,0]];
    const cubic = (t: number, a: number, b: number): number => a + t * t * (3 - 2 * t) * (b - a);
    const component = (index: number): number => cubic(red,
      cubic(yellow, cubic(blue, magic[0]![index]!, magic[4]![index]!), cubic(blue, magic[1]![index]!, magic[5]![index]!)),
      cubic(yellow, cubic(blue, magic[2]![index]!, magic[6]![index]!), cubic(blue, magic[3]![index]!, magic[7]![index]!)));
    return new PdfColor(component(0), component(1), component(2), alpha);
  }

  withAlpha(alpha: number): PdfColor { return new PdfColor(this.red, this.green, this.blue, alpha); }
  withRed(red: number): PdfColor { return new PdfColor(red, this.green, this.blue, this.alpha); }
  withGreen(green: number): PdfColor { return new PdfColor(this.red, green, this.blue, this.alpha); }
  withBlue(blue: number): PdfColor { return new PdfColor(this.red, this.green, blue, this.alpha); }
  withValues(alpha: number | null, red: number | null, green: number | null, blue: number | null): PdfColor {
    return new PdfColor(red ?? this.red, green ?? this.green, blue ?? this.blue, alpha ?? this.alpha);
  }
  toInt(): number {
    return ((Math.round(this.alpha * 255) << 24) | (Math.round(this.red * 255) << 16)
      | (Math.round(this.green * 255) << 8) | Math.round(this.blue * 255)) >>> 0;
  }
  toHex(): string {
    const value = this.toInt();
    return `#${(value & 0xffffff).toString(16).padStart(6, '0')}${(value >>> 24).toString(16).padStart(2, '0')}`;
  }
  toCmyk(): PdfColorCmyk { return PdfColorCmyk.fromRgb(this.red, this.green, this.blue, this.alpha); }
  toHsv(): PdfColorHsv { return PdfColorHsv.fromRgb(this.red, this.green, this.blue, this.alpha); }
  toHsl(): PdfColorHsl { return PdfColorHsl.fromRgb(this.red, this.green, this.blue, this.alpha); }
  get luminance(): number { return colorLuminance(this); }
  get isLight(): boolean { return !this.isDark; }
  get isDark(): boolean { return (this.luminance + 0.05) ** 2 > 0.15; }
  shade(strength: number): PdfColor {
    const hsl = this.toHsl();
    return new PdfColorHsl(hsl.hue, hsl.saturation, clamp(hsl.lightness * (1.5 - strength), 0, 1));
  }
  get complementary(): PdfColorHsv { return this.toHsv().complementary; }
  get monochromatic(): readonly PdfColorHsv[] { return this.toHsv().monochromatic; }
  get splitcomplementary(): readonly PdfColorHsv[] { return this.toHsv().splitcomplementary; }
  get tetradic(): readonly PdfColorHsv[] { return this.toHsv().tetradic; }
  get triadic(): readonly PdfColorHsv[] { return this.toHsv().triadic; }
  get analagous(): readonly PdfColorHsv[] { return this.toHsv().analagous; }
  flatten({ background = new PdfColor(1, 1, 1) }: { readonly background?: PdfColor } = {}): PdfColor {
    return new PdfColor(this.alpha * this.red + (1 - this.alpha) * background.red,
      this.alpha * this.green + (1 - this.alpha) * background.green,
      this.alpha * this.blue + (1 - this.alpha) * background.blue, background.alpha);
  }
  equals(other: unknown): boolean {
    return other instanceof PdfColor && other.constructor === this.constructor && other.red === this.red
      && other.green === this.green && other.blue === this.blue && other.alpha === this.alpha;
  }
  get hashCode(): number { return this.toInt(); }
  toString(): string { return `${this.constructor.name}(${this.red}, ${this.green}, ${this.blue}, ${this.alpha})`; }
}

/** A DeviceGray color; unlike RGB gray it emits one component. */
export class PdfColorGrey extends PdfColor {
  constructor(color: number, alpha = 1) { super(color, color, color, alpha); }
}

export class PdfColorCmyk extends PdfColor {
  readonly cyan: number;
  readonly magenta: number;
  readonly yellow: number;
  readonly black: number;
  constructor(cyan: number, magenta: number, yellow: number, black: number, alpha = 1) {
    unit(cyan); unit(magenta); unit(yellow); unit(black);
    super((1 - cyan) * (1 - black), (1 - magenta) * (1 - black), (1 - yellow) * (1 - black), alpha);
    this.cyan = cyan; this.magenta = magenta; this.yellow = yellow; this.black = black;
  }
  static fromRgb(red: number, green: number, blue: number, alpha = 1): PdfColorCmyk {
    unit(red); unit(green); unit(blue);
    // Correct upstream's maximum expression and division by zero for black.
    const max = Math.max(red, green, blue);
    return max === 0 ? new PdfColorCmyk(0, 0, 0, 1, alpha)
      : new PdfColorCmyk((max - red) / max, (max - green) / max, (max - blue) / max, 1 - max, alpha);
  }
  override toCmyk(): PdfColorCmyk { return this; }
  override toString(): string { return `PdfColorCmyk(${this.cyan}, ${this.magenta}, ${this.yellow}, ${this.black}, ${this.alpha})`; }
}

function rgbHue(red: number, green: number, blue: number, max: number, delta: number): number {
  if (delta === 0) return 0;
  if (max === red) return wrapHue(60 * (green - blue) / delta);
  if (max === green) return 60 * ((blue - red) / delta + 2);
  return 60 * ((red - green) / delta + 4);
}

function cylindricalRgb(hue: number, chroma: number, match: number): Rgb {
  hueValue(hue);
  const secondary = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const components: Rgb = hue < 60 ? [chroma, secondary, 0] : hue < 120 ? [secondary, chroma, 0]
    : hue < 180 ? [0, chroma, secondary] : hue < 240 ? [0, secondary, chroma]
    : hue < 300 ? [secondary, 0, chroma] : [chroma, 0, secondary];
  return [clamp(components[0] + match, 0, 1), clamp(components[1] + match, 0, 1), clamp(components[2] + match, 0, 1)];
}

export class PdfColorHsv extends PdfColor {
  readonly hue: number;
  readonly saturation: number;
  readonly value: number;
  constructor(hue: number, saturation: number, value: number, alpha = 1) {
    unit(saturation); unit(value);
    super(...cylindricalRgb(hue, saturation * value, value - saturation * value), alpha);
    this.hue = hue; this.saturation = saturation; this.value = value;
  }
  static fromRgb(red: number, green: number, blue: number, alpha = 1): PdfColorHsv {
    unit(red); unit(green); unit(blue);
    const max = Math.max(red, green, blue), delta = max - Math.min(red, green, blue);
    return new PdfColorHsv(rgbHue(red, green, blue, max, delta), max === 0 ? 0 : delta / max, max, alpha);
  }
  withHue(hue: number): PdfColorHsv { return new PdfColorHsv(hue, this.saturation, this.value, this.alpha); }
  withSaturation(saturation: number): PdfColorHsv { return new PdfColorHsv(this.hue, saturation, this.value, this.alpha); }
  withValue(value: number): PdfColorHsv { return new PdfColorHsv(this.hue, this.saturation, value, this.alpha); }
  override toHsv(): PdfColorHsv { return this; }
  override get complementary(): PdfColorHsv { return this.withHue(wrapHue(this.hue - 120)); }
  override get monochromatic(): readonly PdfColorHsv[] {
    return [[0.2, 0.1], [0.4, 0.2], [0.15, 0.05]].map(([s, v]) => new PdfColorHsv(this.hue,
      clamp(this.saturation + (this.saturation > 0.5 ? -s! : s!), 0, 1),
      clamp(this.value + (this.value > 0.5 ? -v! : v!), 0, 1)));
  }
  override get splitcomplementary(): readonly PdfColorHsv[] { return [-150, -180].map(offset => this.withHue(wrapHue(this.hue + offset))); }
  override get triadic(): readonly PdfColorHsv[] { return [80, -120].map(offset => this.withHue(wrapHue(this.hue + offset))); }
  override get tetradic(): readonly PdfColorHsv[] { return [120, -150, 60].map(offset => this.withHue(wrapHue(this.hue + offset))); }
  override get analagous(): readonly PdfColorHsv[] { return [30, -20].map(offset => this.withHue(wrapHue(this.hue + offset))); }
  override toString(): string { return `PdfColorHsv(${this.hue}, ${this.saturation}, ${this.value}, ${this.alpha})`; }
}

export class PdfColorHsl extends PdfColor {
  readonly hue: number;
  readonly saturation: number;
  readonly lightness: number;
  constructor(hue: number, saturation: number, lightness: number, alpha = 1) {
    unit(saturation); unit(lightness);
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    super(...cylindricalRgb(hue, chroma, lightness - chroma / 2), alpha);
    this.hue = hue; this.saturation = saturation; this.lightness = lightness;
  }
  static fromRgb(red: number, green: number, blue: number, alpha = 1): PdfColorHsl {
    unit(red); unit(green); unit(blue);
    const max = Math.max(red, green, blue), min = Math.min(red, green, blue), delta = max - min;
    const lightness = (max + min) / 2;
    // Upstream only guards white; all achromatic inputs need zero saturation.
    const saturation = delta === 0 ? 0 : clamp(delta / (1 - Math.abs(2 * lightness - 1)), 0, 1);
    return new PdfColorHsl(rgbHue(red, green, blue, max, delta), saturation, lightness, alpha);
  }
  withHue(hue: number): PdfColorHsl { return new PdfColorHsl(hue, this.saturation, this.lightness, this.alpha); }
  withSaturation(saturation: number): PdfColorHsl { return new PdfColorHsl(this.hue, saturation, this.lightness, this.alpha); }
  withLightness(lightness: number): PdfColorHsl { return new PdfColorHsl(this.hue, this.saturation, lightness, this.alpha); }
  override toHsl(): PdfColorHsl { return this; }
  override toString(): string { return `PdfColorHsl(${this.hue}, ${this.saturation}, ${this.lightness}, ${this.alpha})`; }
}

/** Keep color-space values through solid painting; legacy inputs stay RGB triples. */
export type PaintColor = Rgb | PdfColor;
export function normalizePaintColor(value: ColorInput | null | undefined): PaintColor {
  return value instanceof PdfColor ? value : normalizeColor(value);
}

export function colorComponents(color: ColorInput): readonly number[] {
  if (color instanceof PdfColorCmyk) return [color.cyan, color.magenta, color.yellow, color.black];
  if (color instanceof PdfColorGrey) return [color.red];
  return normalizeColor(color);
}

/** Compare painted components without collapsing distinct device spaces. */
export function samePaintColor(left: ColorInput, right: ColorInput): boolean {
  const a = colorComponents(left), b = colorComponents(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
