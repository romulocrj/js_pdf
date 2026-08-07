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
 *   - pdf/lib/src/pdf/graphic_state.dart
 *   - pdf/lib/src/pdf/obj/formxobject.dart
 *   - pdf/lib/src/svg/mask_path.dart
 */

import type { PdfFont } from './font/font.ts';
import { PdfDataType } from './format/base.ts';
import type { PdfDict } from './format/dict.ts';
import type { PdfStream } from './format/stream.ts';
import type { PdfImage } from './obj/image.ts';
import type { PdfRect } from './rect.ts';

export interface PdfSoftMask {
  readonly content: Uint8Array;
  readonly boundingBox: PdfRect;
  readonly fonts: ReadonlyMap<PdfFont, string>;
  readonly graphicStates: ReadonlyMap<string, PdfDict>;
  readonly patterns: ReadonlyMap<string, PdfDict>;
  readonly shadings: ReadonlyMap<string, PdfDict>;
  readonly images: ReadonlyMap<PdfImage, string>;
}

/** Deferred until the owning PDF document can allocate the form XObject. */
export class PdfSoftMaskReference extends PdfDataType {
  readonly mask: PdfSoftMask;

  constructor(mask: PdfSoftMask) {
    super();
    this.mask = mask;
  }

  override output(_stream: PdfStream): void {
    throw new Error('A PDF soft mask must be resolved by PdfDocument before output');
  }
}
