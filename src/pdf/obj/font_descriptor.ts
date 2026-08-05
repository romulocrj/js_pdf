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
 *   - pdf/lib/src/pdf/obj/font_descriptor.dart
 *
 * Everything a reader needs to substitute or render the font: its bounding box,
 * its vertical metrics, and the stream holding the embedded program.
 */

import { PdfArray } from '../format/array.ts';
import { PdfDict } from '../format/dict.ts';
import type { PdfDictStream } from '../format/dict_stream.ts';
import { PdfName } from '../format/name.ts';
import { PdfNum } from '../format/num.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';

export interface PdfFontDescriptorOptions {
  readonly fontName: string;

  /** The embedded font program; becomes `/FontFile2`. */
  readonly file: PdfObject<PdfDictStream>;

  /** 4 = symbolic, 32 = non-symbolic. Upstream picks by composite-ness. */
  readonly flags: number;

  /** `[xMin, yMin, xMax, yMax]`, already scaled to 1000 units per em. */
  readonly fontBBox: readonly [number, number, number, number];

  /** Fractions of an em, as `PdfFont` reports them. */
  readonly ascent: number;
  readonly descent: number;
}

/**
 * Upstream takes the `PdfTtfFont` itself and reads the numbers back off it in
 * `prepare()`. The port passes the numbers, which keeps this module from
 * importing the font that constructs it.
 *
 * PORT GAP: `/ItalicAngle`, `/CapHeight` and `/StemV` are upstream's constants
 * (0, 10, 79) rather than measurements. They are required entries that no
 * reader uses when the program is embedded, and deriving them properly means
 * reading `post` and `OS/2`, which is a separate piece of work.
 */
export class PdfFontDescriptor extends PdfObject<PdfDict> {
  constructor(document: PdfObjectRegistry, options: PdfFontDescriptorOptions) {
    super(document, new PdfDict([
      ['/Type', new PdfName('/FontDescriptor')],
      ['/FontName', new PdfName(`/${options.fontName}`)],
      ['/FontFile2', options.file.ref()],
      ['/Flags', new PdfNum(options.flags)],
      ['/FontBBox', PdfArray.fromNum([...options.fontBBox])],
      ['/Ascent', new PdfNum(Math.trunc(options.ascent * 1000))],
      ['/Descent', new PdfNum(Math.trunc(options.descent * 1000))],
      ['/ItalicAngle', new PdfNum(0)],
      ['/CapHeight', new PdfNum(10)],
      ['/StemV', new PdfNum(79)]
    ]));
  }
}
