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
 *   - pdf/lib/src/pdf/format/dict.dart
 *
 * Two divergences from upstream, both deliberate:
 *
 *   - Spacing. Upstream emits `<</Type/Page/Count 1>>`, separating only where
 *     the value is not self-delimiting. The port always writes `<< k v k v >>`,
 *     which is what the pre-0.2 string builder produced, so phase 0.2 leaves
 *     every fixture byte-identical. Both are valid PDF.
 *   - No type parameter. Upstream's `PdfDict<T>` mainly exists to express
 *     `PdfDict<PdfIndirect>`; a single `PdfDataType` value type covers every use
 *     the port has without threading a generic through `obj/`.
 *
 * Insertion order is the emission order, so it is part of the output contract —
 * see the key order in `obj/page.ts` and `obj/info.ts`.
 */

import { PdfDataType } from './base.ts';
import type { PdfReferenceable } from './array.ts';
import type { PdfStream } from './stream.ts';

export class PdfDict extends PdfDataType {
  readonly values: Map<string, PdfDataType>;

  constructor(values?: Iterable<readonly [string, PdfDataType]>) {
    super();
    this.values = new Map(values);
  }

  /** `{ '/F1': fontObject }` becomes `<< /F1 3 0 R >>`. */
  static fromObjectMap(objects: Iterable<readonly [string, PdfReferenceable]>): PdfDict {
    const dict = new PdfDict();
    for (const [key, object] of objects) {
      dict.set(key, object.ref());
    }
    return dict;
  }

  get isEmpty(): boolean {
    return this.values.size === 0;
  }

  has(key: string): boolean {
    return this.values.has(key);
  }

  get(key: string): PdfDataType | undefined {
    return this.values.get(key);
  }

  set(key: string, value: PdfDataType): void {
    this.values.set(key, value);
  }

  override output(s: PdfStream): void {
    s.putString('<< ');
    let first = true;
    for (const [key, value] of this.values) {
      if (!first) {
        s.putByte(0x20);
      }
      first = false;
      s.putString(key);
      s.putByte(0x20);
      value.output(s);
    }
    s.putString(' >>');
  }
}
