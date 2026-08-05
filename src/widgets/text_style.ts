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
 *   - pdf/lib/src/widgets/text_style.dart
 *
 * An immutable text style. Every field is optional and `null` means "inherit":
 * a style is merged onto the one the theme supplies, and only the fields it
 * states win. A style with `inherit: false` replaces its parent outright, which
 * is how `ThemeData` guarantees its own styles are complete.
 *
 * The four font slots are the mechanism behind `fontWeight` and `fontStyle`:
 * `font` distributes into whichever slot the style's weight and style select,
 * and the `font` getter reads the slot back out, falling through the other
 * three when the requested one is empty.
 *
 * PORT GAP: `fontFallback` is stored and merged but never consulted. Choosing a
 * different font per glyph means resolving fonts inside the line breaker, which
 * belongs with `RichText` in roadmap phase 3.7.
 *
 * PORT GAP: `decoration`, `decorationColor`, `decorationStyle` and
 * `decorationThickness` are stored but not painted — text decorations land with
 * phase 3.7 as well. Upstream models `decoration` as a combinable bitmask; the
 * port uses a single name until there is a painter to care.
 *
 * PORT GAP: no per-run `background` until rich spans land in phase 3.7, and no
 * `renderingMode` (needs the `Tr` operator).
 */

import { normalizeColor } from '../pdf/color.ts';
import type { ColorInput, Rgb } from '../pdf/color.ts';
import { Font } from './font.ts';

export type FontWeight = 'normal' | 'bold';
export type FontStyle = 'normal' | 'italic';
export type TextDecoration = 'none' | 'underline' | 'overline' | 'lineThrough';
export type TextDecorationStyle = 'solid' | 'double';

/** 12 points, upstream's `TextStyle._defaultFontSize`. */
export const DEFAULT_FONT_SIZE = 12;

/**
 * Upstream's default `height` is 1 — a line box exactly one em tall. The port
 * has used 1.2 since before styles existed, and `Text` still reads this value,
 * so changing it would move every line of every existing document.
 */
export const DEFAULT_LINE_HEIGHT = 1.2;

export interface TextStyleOptions {
  readonly inherit?: boolean;
  readonly color?: ColorInput | null;

  /** Distributed into the slot `fontWeight` and `fontStyle` select. */
  readonly font?: Font | null;
  readonly fontNormal?: Font | null;
  readonly fontBold?: Font | null;
  readonly fontItalic?: Font | null;
  readonly fontBoldItalic?: Font | null;
  readonly fontFallback?: readonly Font[] | null;

  readonly fontSize?: number | null;
  readonly fontWeight?: FontWeight | null;
  readonly fontStyle?: FontStyle | null;

  /** Extra space per glyph, in PDF units — the `Tc` operand. */
  readonly letterSpacing?: number | null;

  /** Extra space per space character, in PDF units — the `Tw` operand. */
  readonly wordSpacing?: number | null;

  /** Extra space between lines, in PDF units, on top of `height`. */
  readonly lineSpacing?: number | null;

  /** Line box height as a multiple of the font size. */
  readonly height?: number | null;

  readonly decoration?: TextDecoration | null;
  readonly decorationColor?: ColorInput | null;
  readonly decorationStyle?: TextDecorationStyle | null;
  readonly decorationThickness?: number | null;
}

export class TextStyle {
  readonly inherit: boolean;
  readonly color: Rgb | null;
  readonly fontNormal: Font | null;
  readonly fontBold: Font | null;
  readonly fontItalic: Font | null;
  readonly fontBoldItalic: Font | null;
  readonly fontFallback: readonly Font[];
  readonly fontSize: number | null;
  readonly fontWeight: FontWeight | null;
  readonly fontStyle: FontStyle | null;
  readonly letterSpacing: number | null;
  readonly wordSpacing: number | null;
  readonly lineSpacing: number | null;
  readonly height: number | null;
  readonly decoration: TextDecoration | null;
  readonly decorationColor: Rgb | null;
  readonly decorationStyle: TextDecorationStyle | null;
  readonly decorationThickness: number | null;

  constructor({
    inherit = true,
    color = null,
    font = null,
    fontNormal = null,
    fontBold = null,
    fontItalic = null,
    fontBoldItalic = null,
    fontFallback = null,
    fontSize = null,
    fontWeight = null,
    fontStyle = null,
    letterSpacing = null,
    wordSpacing = null,
    lineSpacing = null,
    height = null,
    decoration = null,
    decorationColor = null,
    decorationStyle = null,
    decorationThickness = null
  }: TextStyleOptions = {}) {
    const isItalic = fontStyle === 'italic';
    const isBold = fontWeight === 'bold';

    this.inherit = inherit;
    this.color = color == null ? null : normalizeColor(color);
    this.fontNormal = fontNormal ?? (!isItalic && !isBold ? font : null);
    this.fontBold = fontBold ?? (!isItalic && isBold ? font : null);
    this.fontItalic = fontItalic ?? (isItalic && !isBold ? font : null);
    this.fontBoldItalic = fontBoldItalic ?? (isItalic && isBold ? font : null);
    this.fontFallback = fontFallback ?? [];
    this.fontSize = fontSize;
    this.fontWeight = fontWeight;
    this.fontStyle = fontStyle;
    this.letterSpacing = letterSpacing;
    this.wordSpacing = wordSpacing;
    this.lineSpacing = lineSpacing;
    this.height = height;
    this.decoration = decoration;
    this.decorationColor = decorationColor == null ? null : normalizeColor(decorationColor);
    this.decorationStyle = decorationStyle;
    this.decorationThickness = decorationThickness;
  }

  /**
   * The complete style every other one is merged onto: Helvetica in its four
   * faces, black, 12 points.
   */
  static defaultStyle(): TextStyle {
    return new TextStyle({
      inherit: false,
      color: '#000000',
      fontNormal: Font.helvetica(),
      fontBold: Font.helveticaBold(),
      fontItalic: Font.helveticaOblique(),
      fontBoldItalic: Font.helveticaBoldOblique(),
      fontSize: DEFAULT_FONT_SIZE,
      fontWeight: 'normal',
      fontStyle: 'normal',
      letterSpacing: 0,
      wordSpacing: 0,
      lineSpacing: 0,
      height: DEFAULT_LINE_HEIGHT,
      decoration: 'none',
      decorationStyle: 'solid',
      decorationThickness: 1
    });
  }

  /**
   * The font for this style's weight and slant, falling through to whichever
   * slot is filled — a theme that names only a regular face still draws bold
   * text, in the regular face.
   */
  get font(): Font | null {
    if (this.fontWeight !== 'bold') {
      if (this.fontStyle !== 'italic') {
        return this.fontNormal ?? this.fontBold ?? this.fontItalic ?? this.fontBoldItalic;
      }
      return this.fontItalic ?? this.fontNormal ?? this.fontBold ?? this.fontBoldItalic;
    }

    if (this.fontStyle !== 'italic') {
      return this.fontBold ?? this.fontNormal ?? this.fontItalic ?? this.fontBoldItalic;
    }
    return this.fontBoldItalic ?? this.fontBold ?? this.fontItalic ?? this.fontNormal;
  }

  copyWith(options: TextStyleOptions = {}): TextStyle {
    return new TextStyle({
      inherit: this.inherit,
      color: options.color ?? this.color,
      font: options.font ?? this.font,
      fontNormal: options.fontNormal ?? this.fontNormal,
      fontBold: options.fontBold ?? this.fontBold,
      fontItalic: options.fontItalic ?? this.fontItalic,
      fontBoldItalic: options.fontBoldItalic ?? this.fontBoldItalic,
      fontFallback: options.fontFallback ?? this.fontFallback,
      fontSize: options.fontSize ?? this.fontSize,
      fontWeight: options.fontWeight ?? this.fontWeight,
      fontStyle: options.fontStyle ?? this.fontStyle,
      letterSpacing: options.letterSpacing ?? this.letterSpacing,
      wordSpacing: options.wordSpacing ?? this.wordSpacing,
      lineSpacing: options.lineSpacing ?? this.lineSpacing,
      height: options.height ?? this.height,
      decoration: options.decoration ?? this.decoration,
      decorationColor: options.decorationColor ?? this.decorationColor,
      decorationStyle: options.decorationStyle ?? this.decorationStyle,
      decorationThickness: options.decorationThickness ?? this.decorationThickness
    });
  }

  /**
   * This style with `other`'s stated fields on top. A non-inheriting `other`
   * replaces this one entirely — that is what `inherit: false` means.
   */
  merge(other: TextStyle | null | undefined): TextStyle {
    if (other == null) {
      return this;
    }

    if (!other.inherit) {
      return other;
    }

    return this.copyWith({
      color: other.color,
      font: other.font,
      fontNormal: other.fontNormal,
      fontBold: other.fontBold,
      fontItalic: other.fontItalic,
      fontBoldItalic: other.fontBoldItalic,
      fontFallback: [...other.fontFallback, ...this.fontFallback],
      fontSize: other.fontSize,
      fontWeight: other.fontWeight,
      fontStyle: other.fontStyle,
      letterSpacing: other.letterSpacing,
      wordSpacing: other.wordSpacing,
      lineSpacing: other.lineSpacing,
      height: other.height,
      decoration: other.decoration,
      decorationColor: other.decorationColor,
      decorationStyle: other.decorationStyle,
      decorationThickness: other.decorationThickness
    });
  }
}
