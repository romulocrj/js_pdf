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
 *   - pdf/lib/src/pdf/obj/function.dart
 *
 * Gradient interpolation functions. The port uses direct type-2 exponential
 * functions, stitched with type 3 for multiple stops, instead of upstream's
 * indirect sampled streams. Both describe the same piecewise linear RGB ramp;
 * direct dictionaries fit the port's render-before-document architecture.
 */

import type { Rgb } from '../color.ts';
import { PdfArray } from '../format/array.ts';
import { PdfDict } from '../format/dict.ts';
import { PdfNum } from '../format/num.ts';

function interpolation(start: Rgb, end: Rgb): PdfDict {
  return new PdfDict([
    ['/FunctionType', new PdfNum(2)],
    ['/Domain', PdfArray.fromNum([0, 1])],
    ['/C0', PdfArray.fromNum(start)],
    ['/C1', PdfArray.fromNum(end)],
    ['/N', new PdfNum(1)]
  ]);
}

export class PdfBaseFunction {
  static colorsAndStops(colors: readonly Rgb[], stops: readonly number[] = []): PdfDict {
    if (colors.length === 0) {
      throw new RangeError('A gradient needs at least one colour');
    }
    if (stops.length > 0 && colors.length !== stops.length) {
      throw new RangeError('The number of gradient colours must match the number of stops');
    }

    const normalizedColors = [...colors];
    const normalizedStops = stops.length === 0
      ? normalizedColors.map((_, index) => normalizedColors.length === 1 ? 0 : index / (normalizedColors.length - 1))
      : stops.map(value => Math.min(1, Math.max(0, value)));

    if (normalizedColors.length === 1) {
      normalizedColors.push(normalizedColors[0]!);
      normalizedStops.push(1);
    }

    for (let index = 1; index < normalizedStops.length; index++) {
      normalizedStops[index] = Math.max(normalizedStops[index]!, normalizedStops[index - 1]!);
    }

    if (normalizedStops[0]! > 0) {
      normalizedStops.unshift(0);
      normalizedColors.unshift(normalizedColors[0]!);
    }
    if (normalizedStops[normalizedStops.length - 1]! < 1) {
      normalizedStops.push(1);
      normalizedColors.push(normalizedColors[normalizedColors.length - 1]!);
    }

    if (normalizedColors.length === 2) {
      return interpolation(normalizedColors[0]!, normalizedColors[1]!);
    }

    const functions: PdfDict[] = [];
    for (let index = 1; index < normalizedColors.length; index++) {
      functions.push(interpolation(normalizedColors[index - 1]!, normalizedColors[index]!));
    }

    const encode: number[] = [];
    for (let index = 0; index < functions.length; index++) {
      encode.push(0, 1);
    }

    return new PdfDict([
      ['/FunctionType', new PdfNum(3)],
      ['/Domain', PdfArray.fromNum([0, 1])],
      ['/Functions', new PdfArray(functions)],
      ['/Bounds', PdfArray.fromNum(normalizedStops.slice(1, -1))],
      ['/Encode', PdfArray.fromNum(encode)]
    ]);
  }

  /**
   * Repeat or reflect one unit-domain function across a finite parameter range.
   * The range is bounded by the painted geometry, so malformed SVG input cannot
   * allocate an unbounded stitching array.
   */
  static spread(
    fn: PdfDict,
    start: number,
    end: number,
    method: 'repeat' | 'reflect'
  ): PdfDict {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new RangeError('A spread function needs a finite increasing range');
    }

    const boundaries: number[] = [start];
    for (let boundary = Math.floor(start) + 1; boundary < end; boundary++) {
      if (boundaries.length >= 4096) {
        throw new RangeError('SVG gradient spread exceeds 4096 visible periods');
      }
      boundaries.push(boundary);
    }
    boundaries.push(end);

    const functions: PdfDict[] = [];
    const encode: number[] = [];
    for (let index = 1; index < boundaries.length; index++) {
      const segmentStart = boundaries[index - 1]!;
      const segmentEnd = boundaries[index]!;
      const cycle = Math.floor((segmentStart + segmentEnd) / 2);
      const phaseStart = segmentStart - cycle;
      const phaseEnd = segmentEnd - cycle;
      const reflected = method === 'reflect' && Math.abs(cycle % 2) === 1;
      functions.push(fn);
      encode.push(
        reflected ? 1 - phaseStart : phaseStart,
        reflected ? 1 - phaseEnd : phaseEnd
      );
    }

    const scale = end - start;
    return new PdfDict([
      ['/FunctionType', new PdfNum(3)],
      ['/Domain', PdfArray.fromNum([0, 1])],
      ['/Functions', new PdfArray(functions)],
      ['/Bounds', PdfArray.fromNum(
        boundaries.slice(1, -1).map(value => (value - start) / scale)
      )],
      ['/Encode', PdfArray.fromNum(encode)]
    ]);
  }
}
