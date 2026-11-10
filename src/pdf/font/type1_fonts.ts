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
 *   - pdf/lib/src/pdf/font/type1_fonts.dart
 *   - pdf/lib/src/pdf/obj/font.dart
 *   - pdf/lib/src/pdf/obj/type1_font.dart
 */

import { PdfFontMetrics } from './font_metrics.ts';
import type { PdfFont } from './font.ts';
import { PdfDict } from '../format/dict.ts';
import { PdfName } from '../format/name.ts';
import { pdfLiteral, toWinAnsiByte } from '../format/string.ts';

// SIZE: every AFM width is a whole number of thousandths, so each table below is
// packed as two base-64 digits per code (`A`-`Z`, `a`-`z`, `0`-`9`, `+`, `/`)
// instead of 256 numeric literals, saving about 6 KB of minified output.
// Dividing by 1000 yields exactly the double the literal spelled.
// test/static_tables.test.mjs fingerprints the decoded tables.

const widthDigits = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function unpackWidths(packed: string): readonly number[] {
  const widths: number[] = [];
  for (let index = 0; index < packed.length; index += 2) {
    widths.push((widthDigits.indexOf(packed[index]!) << 6 | widthDigits.indexOf(packed[index + 1]!)) / 1000);
  }
  return Object.freeze(widths);
}

/**
 * AFM advance widths for the standard proportional Type1 fonts, expressed in
 * em units and indexed by the encoded byte. Oblique variants have their own
 * tables because their punctuation metrics differ from the upright faces.
 */
export const helveticaWidths: readonly number[] = unpackWidths(
  'H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0H0EWEWFjIsIsN5KbC/FNFNGFJIEWFNEWEWIsIsIsIsIsIsIsIsIsIsEWEWJIJIJIIsP3KbKbLSLSKbJjMKLSEWH0KbIsNBLSMKKbMKLSKbJjLSKbOwKbKbJjEWEWEVHVIsFNIsIsH0IsIsEWIsIsDeDeH0DeNBIsIsIsIsFNH0EWIsH0LSH0H0H0FOEEFOJIH0KPH0DeEWFNPoIsIsFNPoKbD6PoH0JjH0H0DeDdFNFNFeIsPoFNPoH0D6OqH0H0KbEWEWIsIsIsIsEEIsFNLhFyHAJIFNLhFNJeJIFeFeFNIsIZEWFNFeFtHANlNlNvIsKbKbKbKbKbKbPoLSKbKbKbKbEWEWEWEWLSLSMKMKMKMKMKJIMKLSLSLSLSKbKaJjIsIsIsIsIsIsOAH0IsIsIsIsD7D7D7D7IsIsIsIsIsIsIsJIJjIsIsIsIsH0IrH0'
);

export const helveticaBoldWidths: readonly number[] = unpackWidths(
  'EWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWFNHaIsIsN5LSDuFNFNGFJIEWFNEWEWIsIsIsIsIsIsIsIsIsIsFNFNJIJIJIJjPPLSLSLSLSKbJjMKLSEWIsLSJjNBLSMKKbMKLSKbJjLSKbOwKbKbJjFNEWFNJIIsFNIsJjIsJjIsFNJjJjEWEWIsEWN5JjJjJjJjGFIsFNJjIsMKIsIsH0GFEYGFJIFeIsFeEWIsH0PoIsIsFNPoKbFNPoFeJjFeFeEWEWH0H0FeIsPoFNPoIsFNOwFeH0KbEWFNIsIsIsIsEYIsFNLhFyIsJIFNLhFNGQJIFNFNFNJjIsEWFNFNFtIsNCNCNCJjLSLSLSLSLSLSPoLSKbKbKbKbEWEWEWEWLSLSMKMKMKMKMKJIMKLSLSLSLSKbKbJjIsIsIsIsIsIsN5IsIsIsIsIsEWEWEWEWJjJjJjJjJjJjJjJIJjJjJjJjJjIsJjIs'
);

export const helveticaBoldObliqueWidths: readonly number[] = unpackWidths(
  'EWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWFNHaIsIsN5LSDuFNFNGFJIEWFNEWEWIsIsIsIsIsIsIsIsIsIsFNFNJIJIJIJjPPLSLSLSLSKbJjMKLSEWIsLSJjNBLSMKKbMKLSKbJjLSKbOwKbKbJjFNEWFNJIIsFNIsJjIsJjIsFNJjJjEWEWIsEWN5JjJjJjJjGFIsFNJjIsMKIsIsH0GFEYGFJIFeIsFeEWIsH0PoIsIsFNPoKbFNPoFeJjFeFeEWEWH0H0FeIsPoFNPoIsFNOwFeH0KbEWFNIsIsIsIsEYIsFNLhFyIsJIFNLhFNGQJIFNFNFNJjIsEWFNFNFtIsNCNCNCJjLSLSLSLSLSLSPoLSKbKbKbKbEWEWEWEWLSLSMKMKMKMKMKJIMKLSLSLSLSKbKbJjIsIsIsIsIsIsN5IsIsIsIsIsEWEWEWEWJjJjJjJjJjJjJjJIJjJjJjJjJjIsJjIs'
);

export const helveticaObliqueWidths: readonly number[] = unpackWidths(
  'EWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWEWFjIsIsN5KbC/FNFNGFJIEWFNEWEWIsIsIsIsIsIsIsIsIsIsEWEWJIJIJIIsP3KbKbLSLSKbJjMKLSEWH0KbIsNBLSMKKbMKLSKbJjLSKbOwKbKbJjEWEWEWHVIsFNIsIsH0IsIsEWIsIsDeDeH0DeNBIsIsIsIsFNH0EWIsH0LSH0H0H0FOEEFOJIFeIsFeDeIsFNPoIsIsFNPoKbFNPoFeJjFeFeDeDeFNFNFeIsPoFNPoH0FNOwFeH0KbEWFNIsIsIsIsEEIsFNLhFyIsJIFNLhFNGQJIFNFNFNIsIZEWFNFNFtIsNCNCNCJjKbKbKbKbKbKbPoLSKbKbKbKbEWEWEWEWLSLSMKMKMKMKMKJIMKLSLSLSLSKbKbJjIsIsIsIsIsIsN5H0IsIsIsIsEWEWEWEWIsIsIsIsIsIsIsJIJjIsIsIsIsH0IsH0'
);

export const timesWidths: readonly number[] = unpackWidths(
  'D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6FNGYH0H0NBMKC0FNFNH0I0D6FND6EWH0H0H0H0H0H0H0H0H0H0EWEWI0I0I0G8OZLSKbKbLSJjIsLSLSFNGFLSJjN5LSLSIsLSKbIsJjLSLSOwLSLSJjFNEWFNHVH0FNG8H0G8H0G8FNH0H0EWEWH0EWMKH0H0H0H0FNGFEWH0H0LSH0H0G8HgDIHgIdFeH0FeFNH0G8PoH0H0FNPoIsFNN5FeJjFeFeFNFNG8G8FeH0PoFNPUGFFNLSFeG8LSD6FNH0H0H0H0DIH0FNL4EUH0I0FNL4FNGQI0EsEsFNH0HFD6FNEsE2H0LuLuLuG8LSLSLSLSLSLSN5KbJjJjJjJjFNFNFNFNLSLSLSLSLSLSLSI0LSLSLSLSLSLSIsH0G8G8G8G8G8G8KbG8G8G8G8G8EWEWEWEWH0H0H0H0H0H0H0I0H0H0H0H0H0H0H0H0'
);

export const timesBoldWidths: readonly number[] = unpackWidths(
  'D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6FNIrH0H0PoNBEWFNFNH0I6D6FND6EWH0H0H0H0H0H0H0H0H0H0FNFNI6I6I6H0OiLSKbLSLSKbJjMKMKGFH0MKKbOwLSMKJjMKLSIsKbLSLSPoLSLSKbFNEWFNJFH0FNH0IsG8IsG8FNH0IsEWFNIsEWNBIsH0IsIsG8GFFNIsH0LSH0H0G8GKDcGKIIFeH0FeFNH0H0PoH0H0FNPoIsFNPoFeKbFeFeFNFNH0H0FeH0PoFNPoGFFNLSFeG8LSD6FNH0H0H0H0DcH0FNLrEsH0I6FNLrFNGQI6EsEsFNIsIcD6FNEsFKH0LuLuLuH0LSLSLSLSLSLSPoLSKbKbKbKbGFGFGFGFLSLSMKMKMKMKMKI6MKLSLSLSLSLSJjIsH0H0H0H0H0H0LSG8G8G8G8G8EWEWEWEWH0IsH0H0H0H0H0I6H0IsIsIsIsH0IsH0'
);

export const timesBoldItalicWidths: readonly number[] = unpackWidths(
  'D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6GFIrH0H0NBMKEWFNFNH0I6D6FND6EWH0H0H0H0H0H0H0H0H0H0FNFNI6I6I6H0NAKbKbKbLSKbKbLSMKGFH0KbJjN5LSLSJjLSKbIsJjLSKbN5KbJjJjFNEWFNI6H0FNH0H0G8H0G8FNH0IsEWEWH0EWMKIsH0H0H0GFGFEWIsG8KbH0G8GFFcDcFcI6FeH0FeFNH0H0PoH0H0FNPoIsFNOwFeJjFeFeFNFNH0H0FeH0PoFNPoGFFNLSFeGFJjD6GFH0H0H0H0DcH0FNLrEKH0JeFNLrFNGQI6EsEsFNJAH0D6FNEsEsH0LuLuLuH0KbKbKbKbKbKbOwKbKbKbKbKbGFGFGFGFLSLSLSLSLSLSLSI6LSLSLSLSLSJjJjH0H0H0H0H0H0H0LSG8G8G8G8G8EWEWEWEWH0IsH0H0H0H0H0I6H0IsIsIsIsG8H0G8'
);

export const timesItalicWidths: readonly number[] = unpackWidths(
  'D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6D6FNGkH0H0NBMKDWFNFNH0KjD6FND6EWH0H0H0H0H0H0H0H0H0H0FNFNKjKjKjH0OYJjJjKbLSJjJjLSLSFNG8KbIsNBKbLSJjLSJjH0IsLSJjNBJjIsIsGFEWGFGmH0FNH0H0G8H0G8EWH0H0EWEWG8EWLSH0H0H0H0GFGFEWH0G8KbG8G8GFGQETGQIdFeH0FeFNH0IsN5H0H0FNPoH0FNOwFeIsFeFeFNFNIsIsFeH0N5FNPUGFFNKbFeGFIsD6GFH0H0H0H0ETH0FNL4EUH0KjFNL4FNGQKjEsEsFNH0ILD6FNEsE2H0LuLuLuH0JjJjJjJjJjJjN5KbJjJjJjJjFNFNFNFNLSKbLSLSLSLSLSKjLSLSLSLSLSIsJjH0H0H0H0H0H0H0KbG8G8G8G8G8EWEWEWEWH0H0H0H0H0H0H0KjH0H0H0H0H0G8H0G8'
);

export const symbolWidths: readonly number[] = unpackWidths(
  'JLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLD6FNLJH0IlNBMKG3FNFNH0IlD6IlD6EWH0H0H0H0H0H0H0H0H0H0EWEWIlIlIlG8IlLSKbLSJkJjL7JbLSFNJ3LSKuN5LSLSMALlIsJQJjKyG3MAKFMbJjFNNfFNKSH0H0J3IlIlHuG3IJGbJbFJJbIlIlJAIJIlIlIJIlJbG3JALJKuHtKuHuHgDIHgIlJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLJLLuJsD3IlCnLJH0LxLxLxLxQSPbJbPbJbGQIlGbIlIlLJHuHMIlIlIlIlPoJbPoKSM3KuMbPbMAMAM3MAMALJLJLJLJLJLJLJMALJMWMWN6M3IlD6LJJbJbQSPbJbPbJbHuFJMWMWMSLJGAGAGAGAGAGAHuHuHuHuJLFJESKuKuKuGAGAGAGAGAGAHuHuHuJL'
);

export const zapfDingbatsWidths: readonly number[] = unpackWidths(
  'LqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqEWPOPBPOPULPMVMWMXKyPAOrIlNXOPOlOPOxPOLzNOL6L5I7KlL7L4L3LyHuIoIZJBK0MSMUMUMWMZMaMwM3MVNJM3NBMwM/ObLoLTLtMWMYK3MIMAMYL3LDLEKqK9M6MvMVMVLDKvK4KxMSMTLJMXMRMXNpL5L6L6L3L3N8N8MUMQG2CKEVGfGIGIKcKcLqGGGGE9E9EUEUH9H9GaGaDqDqFOFOLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLqLcIgIgOOKbL4L4MIJTK2JyMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUMUN+NGP4HKLsOcLsOWOfOgOgNCNpM8OcOcOVOiOjHPNzNENENjNjK4K4NqLqNqL4OyMDNhMDN4PHN4M/NpOfPKOWLq'
);

interface Type1FontDefinition {
  readonly fontName: string;
  readonly ascent: number;
  readonly descent: number;
  readonly widths?: readonly number[];
  readonly missingWidth?: number;
}

/** One of the 14 Type1 fonts that every conforming PDF reader provides. */
export class PdfType1Font implements PdfFont {
  readonly fontName: string;
  readonly ascent: number;
  readonly descent: number;
  readonly widths: readonly number[];
  readonly missingWidth: number;

  private constructor({
    fontName,
    ascent,
    descent,
    widths = [],
    missingWidth = 0.6
  }: Type1FontDefinition) {
    this.fontName = fontName;
    this.ascent = ascent;
    this.descent = descent;
    this.widths = widths;
    this.missingWidth = missingWidth;
  }

  static courier(): PdfType1Font {
    return new PdfType1Font({ fontName: 'Courier', ascent: 0.910, descent: -0.220 });
  }

  static courierBold(): PdfType1Font {
    return new PdfType1Font({ fontName: 'Courier-Bold', ascent: 0.910, descent: -0.220 });
  }

  static courierBoldOblique(): PdfType1Font {
    return new PdfType1Font({ fontName: 'Courier-BoldOblique', ascent: 0.910, descent: -0.220 });
  }

  static courierOblique(): PdfType1Font {
    return new PdfType1Font({ fontName: 'Courier-Oblique', ascent: 0.910, descent: -0.220 });
  }

  static helvetica(): PdfType1Font {
    return new PdfType1Font({
      fontName: 'Helvetica',
      ascent: 0.931,
      descent: -0.225,
      widths: helveticaWidths
    });
  }

  static helveticaBold(): PdfType1Font {
    return new PdfType1Font({
      fontName: 'Helvetica-Bold',
      ascent: 0.962,
      descent: -0.228,
      widths: helveticaBoldWidths
    });
  }

  static helveticaBoldOblique(): PdfType1Font {
    return new PdfType1Font({
      fontName: 'Helvetica-BoldOblique',
      ascent: 0.962,
      descent: -0.228,
      widths: helveticaBoldObliqueWidths
    });
  }

  static helveticaOblique(): PdfType1Font {
    return new PdfType1Font({
      fontName: 'Helvetica-Oblique',
      ascent: 0.931,
      descent: -0.225,
      widths: helveticaObliqueWidths
    });
  }

  static times(): PdfType1Font {
    return new PdfType1Font({
      fontName: 'Times-Roman',
      ascent: 0.898,
      descent: -0.218,
      widths: timesWidths
    });
  }

  static timesBold(): PdfType1Font {
    return new PdfType1Font({
      fontName: 'Times-Bold',
      ascent: 0.935,
      descent: -0.218,
      widths: timesBoldWidths
    });
  }

  static timesBoldItalic(): PdfType1Font {
    return new PdfType1Font({
      fontName: 'Times-BoldItalic',
      ascent: 0.921,
      descent: -0.218,
      widths: timesBoldItalicWidths
    });
  }

  static timesItalic(): PdfType1Font {
    return new PdfType1Font({
      fontName: 'Times-Italic',
      ascent: 0.883,
      descent: -0.217,
      widths: timesItalicWidths
    });
  }

  static symbol(): PdfType1Font {
    return new PdfType1Font({
      fontName: 'Symbol',
      ascent: 1.010,
      descent: -0.293,
      widths: symbolWidths
    });
  }

  static zapfDingbats(): PdfType1Font {
    return new PdfType1Font({
      fontName: 'ZapfDingbats',
      ascent: 0.820,
      descent: -0.143,
      widths: zapfDingbatsWidths
    });
  }

  glyphMetrics(charCode: number): PdfFontMetrics {
    const advanceWidth = this.widths[charCode] ?? this.missingWidth;
    return new PdfFontMetrics({
      left: 0,
      top: this.descent,
      right: advanceWidth,
      bottom: this.ascent
    });
  }

  stringMetrics(text: string, size: number, letterSpacing = 0): PdfFontMetrics {
    const metrics: PdfFontMetrics[] = [];
    for (const character of String(text)) {
      metrics.push(
        this.glyphMetrics(toWinAnsiByte(character.codePointAt(0) ?? 0x3f)).scale(size)
      );
    }
    return PdfFontMetrics.append(metrics, letterSpacing);
  }

  encodeText(text: string): string {
    return pdfLiteral(text);
  }

  /**
   * SERIALIZATION CHOICE: no `/FirstChar`, `/LastChar`, `/Widths` or `/FontDescriptor`.
   * Upstream emits those for PDF 1.5 and up. They are optional for the 14
   * standard fonts, whose metrics every reader already has built in — which is
   * exactly the set this class covers.
   *
   * The registry argument is unused here: a standard font references nothing.
   */
  resourceDict(): PdfDict {
    return new PdfDict([
      ['/Type', new PdfName('/Font')],
      ['/Subtype', new PdfName('/Type1')],
      ['/BaseFont', new PdfName(`/${this.fontName}`)],
      ['/Encoding', new PdfName('/WinAnsiEncoding')]
    ]);
  }
}

export const defaultPdfFont: PdfFont = PdfType1Font.helvetica();
