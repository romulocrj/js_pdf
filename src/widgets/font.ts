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
 *   - pdf/lib/src/widgets/font.dart
 *
 * A lazy font declaration. `Font` is what a `TextStyle` or a `ThemeData` holds;
 * the `PdfFont` it stands for is only built when something actually draws with
 * it, so declaring a theme with four faces costs nothing until text uses them.
 *
 * Upstream caches the built font on the declaration and re-builds it when the
 * document changes. The port keeps that cache on the `Document` instead — an
 * embedded font accumulates the code points it has been asked to encode, so a
 * declaration reused across two documents must not hand the second one the
 * first one's subset.
 */

import type { PdfFont } from '../pdf/font/font.ts';
import { PdfType1Font } from '../pdf/font/type1_fonts.ts';
import { PdfTtfFont } from '../pdf/obj/ttf_font.ts';
import type { PdfTtfFontOptions } from '../pdf/obj/ttf_font.ts';
import type { RenderContext } from './widget.ts';

/** The 14 standard faces, upstream's `Type1Fonts` enum. */
export type Type1FontName =
  | 'courier' | 'courierBold' | 'courierBoldOblique' | 'courierOblique'
  | 'helvetica' | 'helveticaBold' | 'helveticaBoldOblique' | 'helveticaOblique'
  | 'times' | 'timesBold' | 'timesBoldItalic' | 'timesItalic'
  | 'symbol' | 'zapfDingbats';

const TYPE1_FACES: Readonly<Record<Type1FontName, () => PdfType1Font>> = Object.freeze({
  courier: PdfType1Font.courier,
  courierBold: PdfType1Font.courierBold,
  courierBoldOblique: PdfType1Font.courierBoldOblique,
  courierOblique: PdfType1Font.courierOblique,
  helvetica: PdfType1Font.helvetica,
  helveticaBold: PdfType1Font.helveticaBold,
  helveticaBoldOblique: PdfType1Font.helveticaBoldOblique,
  helveticaOblique: PdfType1Font.helveticaOblique,
  times: PdfType1Font.times,
  timesBold: PdfType1Font.timesBold,
  timesBoldItalic: PdfType1Font.timesBoldItalic,
  timesItalic: PdfType1Font.timesItalic,
  symbol: PdfType1Font.symbol,
  zapfDingbats: PdfType1Font.zapfDingbats
});

export class Font {
  private readonly create: () => PdfFont;

  private constructor(create: () => PdfFont) {
    this.create = create;
  }

  static type1(face: Type1FontName): Font {
    const factory = TYPE1_FACES[face];
    if (factory === undefined) {
      throw new TypeError(`\`${face}\` is not one of the 14 standard Type1 fonts`);
    }
    return new Font(factory);
  }

  static courier(): Font { return Font.type1('courier'); }
  static courierBold(): Font { return Font.type1('courierBold'); }
  static courierBoldOblique(): Font { return Font.type1('courierBoldOblique'); }
  static courierOblique(): Font { return Font.type1('courierOblique'); }
  static helvetica(): Font { return Font.type1('helvetica'); }
  static helveticaBold(): Font { return Font.type1('helveticaBold'); }
  static helveticaBoldOblique(): Font { return Font.type1('helveticaBoldOblique'); }
  static helveticaOblique(): Font { return Font.type1('helveticaOblique'); }
  static times(): Font { return Font.type1('times'); }
  static timesBold(): Font { return Font.type1('timesBold'); }
  static timesBoldItalic(): Font { return Font.type1('timesBoldItalic'); }
  static timesItalic(): Font { return Font.type1('timesItalic'); }
  static symbol(): Font { return Font.type1('symbol'); }
  static zapfDingbats(): Font { return Font.type1('zapfDingbats'); }

  /**
   * A TrueType font from bytes the caller already has. Nothing here reads a
   * file: the host loads the font however it likes and hands over the array.
   */
  static ttf(data: Uint8Array, options?: PdfTtfFontOptions): Font {
    if (!(data instanceof Uint8Array)) {
      throw new TypeError('Font.ttf expects the font file as a Uint8Array');
    }
    return new Font(() => new PdfTtfFont(data, options));
  }

  /**
   * Wrap a `PdfFont` that already exists. The port's own addition: it is what
   * lets `DocumentOptions.font`, which predates this file, keep naming a font
   * object directly.
   */
  static fromPdfFont(font: PdfFont): Font {
    return new Font(() => font);
  }

  /** Build the font object. Callers should go through `getFont` instead. */
  build(): PdfFont {
    return this.create();
  }

  /** The `PdfFont` this declaration stands for in `context`'s document. */
  getFont(context: RenderContext): PdfFont {
    return context.document.resolveFont(this);
  }
}
