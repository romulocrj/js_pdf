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
 *   - pdf/lib/src/widgets/icon.dart
 *
 * The icon font is supplied as bytes by the caller through `Font.ttf`; this
 * module performs no loading and keeps the widget synchronous and host-free.
 */

import { assertFiniteNumber } from '../base/assert.ts';
import { normalizeColor } from '../pdf/color.ts';
import type { ColorInput, Rgb } from '../pdf/color.ts';
import { Opacity, Transform } from './basic.ts';
import type { Font } from './font.ts';
import { RichText, TextSpan } from './text.ts';
import type { TextDirection } from './text.ts';
import { TextStyle } from './text_style.ts';
import { StatelessWidget } from './widget.ts';
import type { AnyWidget, RenderContext } from './widget.ts';

export interface IconDataOptions {
  readonly matchTextDirection?: boolean;
}

/** A font glyph used as an icon. */
export class IconData {
  readonly codePoint: number;
  readonly matchTextDirection: boolean;

  constructor(codePoint: number, { matchTextDirection = false }: IconDataOptions = {}) {
    const value = Number(codePoint);
    if (
      !Number.isInteger(value) || value < 0 || value > 0x10ffff ||
      (value >= 0xd800 && value <= 0xdfff)
    ) {
      throw new RangeError('IconData.codePoint must be a valid Unicode scalar value');
    }
    this.codePoint = value;
    this.matchTextDirection = Boolean(matchTextDirection);
  }
}

export interface IconThemeDataOptions {
  readonly color?: ColorInput | null;
  readonly opacity?: number | null;
  readonly size?: number | null;
  readonly font?: Font | null;
}

/** Defaults inherited by icon widgets through `ThemeData`. */
export class IconThemeData {
  readonly color: Rgb | null;
  readonly opacity: number | null;
  readonly size: number | null;
  readonly font: Font | null;

  constructor({ color = null, opacity = null, size = null, font = null }: IconThemeDataOptions = {}) {
    this.color = color === null ? null : normalizeColor(color);
    this.opacity = opacity === null ? null : assertFiniteNumber(Number(opacity), 'icon opacity');
    this.size = size === null ? null : assertFiniteNumber(Number(size), 'icon size');
    this.font = font;
    if (this.opacity !== null && (this.opacity < 0 || this.opacity > 1)) {
      throw new RangeError('icon opacity must be between 0 and 1');
    }
    if (this.size !== null && this.size < 0) {
      throw new RangeError('icon size cannot be negative');
    }
  }

  static fallback(font: Font | null = null): IconThemeData {
    return new IconThemeData({ color: '#000000', opacity: 1, size: 24, font });
  }

  copyWith(options: IconThemeDataOptions = {}): IconThemeData {
    return new IconThemeData({
      color: options.color ?? this.color,
      opacity: options.opacity ?? this.opacity,
      size: options.size ?? this.size,
      font: options.font ?? this.font
    });
  }
}

export interface IconOptions {
  readonly size?: number | null;
  readonly color?: ColorInput | null;
  readonly textDirection?: TextDirection | null;
  readonly font?: Font | null;
}

/** Draws one glyph from the configured icon font. */
export class Icon extends StatelessWidget {
  readonly icon: IconData;
  readonly size: number | null;
  readonly color: Rgb | null;
  readonly textDirection: TextDirection | null;
  readonly font: Font | null;

  constructor(icon: IconData, {
    size = null,
    color = null,
    textDirection = null,
    font = null
  }: IconOptions = {}) {
    super();
    if (!(icon instanceof IconData)) throw new TypeError('Icon expects an IconData value');
    this.icon = icon;
    this.size = size === null ? null : assertFiniteNumber(Number(size), 'icon size');
    this.color = color === null ? null : normalizeColor(color);
    this.textDirection = textDirection;
    this.font = font;
    if (this.size !== null && this.size < 0) throw new RangeError('icon size cannot be negative');
    if (textDirection !== null && textDirection !== 'ltr' && textDirection !== 'rtl') {
      throw new TypeError(`Unknown text direction: ${String(textDirection)}`);
    }
  }

  override build(context: RenderContext): AnyWidget {
    const theme = context.theme.iconTheme;
    const size = this.size ?? theme.size ?? 24;
    const color = this.color ?? theme.color ?? [0, 0, 0];
    // Upstream reads opacity from the alpha channel on its colour value. The
    // port's RGB tuple has no alpha cell, so `IconThemeData.opacity` supplies
    // the equivalent scoped graphic state explicitly.
    const opacity = theme.opacity ?? 1;
    const font = this.font ?? theme.font;
    if (font === null) {
      throw new Error('Icon requires Icon.font or ThemeData.withFont({ icons })');
    }

    const direction = this.textDirection ?? 'ltr';
    let widget: AnyWidget = new RichText({
      textDirection: direction,
      text: new TextSpan({
        text: String.fromCodePoint(this.icon.codePoint),
        style: new TextStyle({
          inherit: false,
          color,
          fontNormal: font,
          fontSize: size,
          fontWeight: 'normal',
          fontStyle: 'normal',
          letterSpacing: 0,
          wordSpacing: 0,
          lineSpacing: 0,
          height: 1,
          decoration: 'none'
        })
      })
    });

    if (this.icon.matchTextDirection && direction === 'rtl') {
      widget = new Transform({
        transform: [-1, 0, 0, 1, 0, 0],
        alignment: 'center',
        child: widget
      });
    }
    if (opacity < 1) widget = new Opacity({ opacity, child: widget });
    return widget;
  }
}
