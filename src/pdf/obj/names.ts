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
 *   - pdf/lib/src/pdf/obj/names.dart
 */

import { PdfArray } from '../format/array.ts';
import { PdfDict } from '../format/dict.ts';
import { PdfName } from '../format/name.ts';
import { PdfNull } from '../format/null_value.ts';
import { PdfNum } from '../format/num.ts';
import { PdfString } from '../format/string.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';
import type { PdfPage } from './page.ts';

interface NamedDestination {
  readonly name: string;
  readonly page: PdfPage;
  readonly x: number | null;
  readonly y: number | null;
  readonly zoom: number | null;
}

/** The catalog `/Names` dictionary, currently containing named destinations. */
export class PdfNames extends PdfObject<PdfDict> {
  private readonly destinations: NamedDestination[] = [];

  constructor(document: PdfObjectRegistry) {
    super(document, new PdfDict());
  }

  addDestination(
    name: string,
    page: PdfPage,
    { x = null, y = null, zoom = null }: {
      readonly x?: number | null;
      readonly y?: number | null;
      readonly zoom?: number | null;
    } = {}
  ): void {
    this.destinations.push({ name, page, x, y, zoom });
  }

  override prepare(): void {
    const sorted = [...this.destinations].sort((a, b) => a.name.localeCompare(b.name));
    const values = new PdfArray();
    for (const destination of sorted) {
      values.add(new PdfString(destination.name));
      values.add(new PdfDict([[
        '/D',
        new PdfArray([
          destination.page.ref(),
          new PdfName('/XYZ'),
          destination.x === null ? new PdfNull() : new PdfNum(destination.x),
          destination.y === null ? new PdfNull() : new PdfNum(destination.y),
          destination.zoom === null ? new PdfNull() : new PdfNum(destination.zoom)
        ])
      ]]));
    }

    const destinations = new PdfDict();
    if (sorted.length > 0) {
      destinations.set('/Names', values);
      destinations.set('/Limits', new PdfArray([
        new PdfString(sorted[0]!.name),
        new PdfString(sorted[sorted.length - 1]!.name)
      ]));
    }
    this.params.set('/Dests', destinations);
  }
}
