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
 *   - pdf/lib/src/widgets/geometry.dart
 *   - pdf/lib/src/pdf/rect.dart
 */

export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/**
 * Upstream this is `EdgeInsets` with its `.all` / `.symmetric` / `.only`
 * constructors; a JavaScript caller expresses the same three shapes as a
 * number, a `{vertical, horizontal}` pair, or explicit sides.
 */
export type InsetsInput =
  | number
  | Partial<Insets> & { readonly vertical?: number; readonly horizontal?: number };

export function normalizeInsets(value: InsetsInput = 0): Insets {
  if (typeof value === 'number') {
    return { top: value, right: value, bottom: value, left: value };
  }

  return {
    top: Number(value.top ?? value.vertical ?? 0),
    right: Number(value.right ?? value.horizontal ?? 0),
    bottom: Number(value.bottom ?? value.vertical ?? 0),
    left: Number(value.left ?? value.horizontal ?? 0)
  };
}
