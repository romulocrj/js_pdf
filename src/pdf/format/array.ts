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
 *   - pdf/lib/src/pdf/format/array.dart
 *
 * Spacing diverges from upstream. Upstream omits the separator before a name,
 * string, array or dictionary because those are self-delimiting, producing
 * `[/A/B]`. The port always separates with a single space — `[/A /B]` — which is
 * what the pre-0.2 string builder emitted, so phase 0.2 keeps every fixture
 * byte-identical. Both forms are valid PDF; the port's is easier to read.
 */

import { PdfDataType } from './base.ts';
import { PdfNum } from './num.ts';
import type { PdfIndirect } from './indirect.ts';
import type { PdfStream } from './stream.ts';

/**
 * Anything that can hand out a reference to itself. Declared structurally so
 * `format/` never has to import `obj/`, keeping the import direction one-way.
 */
export interface PdfReferenceable {
  ref(): PdfIndirect;
}

export class PdfArray extends PdfDataType {
  readonly values: PdfDataType[];

  constructor(values: readonly PdfDataType[] = []) {
    super();
    this.values = [...values];
  }

  /** `[0 0 595.2756 841.8898]` — the `/MediaBox` and `/FontBBox` shape. */
  static fromNum(values: readonly number[]): PdfArray {
    return new PdfArray(values.map(value => new PdfNum(value)));
  }

  /** `[5 0 R 9 0 R]` — the `/Kids` and `/Contents` shape. */
  static fromObjects(objects: readonly PdfReferenceable[]): PdfArray {
    return new PdfArray(objects.map(object => object.ref()));
  }

  get length(): number {
    return this.values.length;
  }

  add(value: PdfDataType): void {
    this.values.push(value);
  }

  override output(s: PdfStream): void {
    s.putString('[');
    for (let index = 0; index < this.values.length; index++) {
      if (index > 0) {
        s.putByte(0x20);
      }
      this.values[index]?.output(s);
    }
    s.putString(']');
  }
}
