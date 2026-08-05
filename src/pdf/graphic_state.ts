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
 *   - pdf/lib/src/pdf/graphic_state.dart
 *
 * The `/ExtGState` dictionary a `gs` operator selects: constant alpha and blend
 * mode, which is what `Opacity` and SVG's `fill-opacity` need.
 *
 * Three divergences:
 *
 *   - No `PdfGraphicStates` document object. Upstream keeps one indirect object
 *     holding every state in the file and points each page's `/ExtGState` at it;
 *     the port registers states per page, as it does fonts, because a canvas is
 *     rendered to operators before any document exists. See `PdfCanvas.addFont`
 *     for the same reasoning applied to `/Font`.
 *   - `key` replaces Dart's structural `operator ==`. Two states with the same
 *     values must share one name, or a page that draws fifty half-transparent
 *     boxes writes fifty identical dictionaries.
 *   - No `/SMask` and no `/TR`. A soft mask needs a form XObject and a transfer
 *     function needs `obj/function.dart`; neither exists in the port yet.
 */

import { PdfDict } from './format/dict.ts';
import { PdfName } from './format/name.ts';
import { PdfNum } from './format/num.ts';

/**
 * The separable and non-separable blend modes of PDF 1.4.
 *
 * Upstream is an `enum` whose names it converts to PDF names by capitalizing
 * the first letter of `toString()`. An `enum` is not erasable TypeScript, so
 * this is a string union and the mapping is a table.
 */
export type PdfBlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'colorDodge'
  | 'colorBurn'
  | 'hardLight'
  | 'softLight'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

const BLEND_MODE_NAMES: Readonly<Record<PdfBlendMode, string>> = Object.freeze({
  normal: '/Normal',
  multiply: '/Multiply',
  screen: '/Screen',
  overlay: '/Overlay',
  darken: '/Darken',
  lighten: '/Lighten',
  colorDodge: '/ColorDodge',
  colorBurn: '/ColorBurn',
  hardLight: '/HardLight',
  softLight: '/SoftLight',
  difference: '/Difference',
  exclusion: '/Exclusion',
  hue: '/Hue',
  saturation: '/Saturation',
  color: '/Color',
  luminosity: '/Luminosity'
});

export interface PdfGraphicStateOptions {
  /** Sets both opacities at once, as upstream's constructor does. */
  readonly opacity?: number | null;
  readonly fillOpacity?: number | null;
  readonly strokeOpacity?: number | null;
  readonly blendMode?: PdfBlendMode | null;
}

export class PdfGraphicState {
  readonly fillOpacity: number | null;
  readonly strokeOpacity: number | null;
  readonly blendMode: PdfBlendMode | null;

  constructor({
    opacity = null,
    fillOpacity = null,
    strokeOpacity = null,
    blendMode = null
  }: PdfGraphicStateOptions = {}) {
    this.fillOpacity = fillOpacity ?? opacity;
    this.strokeOpacity = strokeOpacity ?? opacity;
    this.blendMode = blendMode;
  }

  /** Nothing to write: a `gs` selecting this state would be a no-op. */
  get isEmpty(): boolean {
    return this.fillOpacity === null && this.strokeOpacity === null && this.blendMode === null;
  }

  /** Value identity, standing in for Dart's `operator ==`. */
  get key(): string {
    return `${this.fillOpacity}|${this.strokeOpacity}|${this.blendMode}`;
  }

  output(): PdfDict {
    const params = new PdfDict();

    if (this.strokeOpacity !== null) {
      params.set('/CA', new PdfNum(this.strokeOpacity));
    }

    if (this.fillOpacity !== null) {
      params.set('/ca', new PdfNum(this.fillOpacity));
    }

    if (this.blendMode !== null) {
      params.set('/BM', new PdfName(BLEND_MODE_NAMES[this.blendMode]));
    }

    return params;
  }
}
