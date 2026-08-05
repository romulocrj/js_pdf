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

/**
 * Upstream's `EdgeInsets` named constructors, as a frozen object of factories.
 *
 * `InsetsInput` already accepts every shape these produce, so this is sugar for
 * callers who prefer the upstream spelling — `EdgeInsets.only({ left: 8 })`
 * reads the same in both languages. A `class` with static methods would work
 * too; a frozen object matches how `PageFormat` is exposed and stays erasable.
 */
export const EdgeInsets = Object.freeze({
  zero: Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 }) as Insets,

  all(value: number): Insets {
    return { top: value, right: value, bottom: value, left: value };
  },

  symmetric({ vertical = 0, horizontal = 0 }: { vertical?: number; horizontal?: number }): Insets {
    return { top: vertical, right: horizontal, bottom: vertical, left: horizontal };
  },

  only({ top = 0, right = 0, bottom = 0, left = 0 }: Partial<Insets> = {}): Insets {
    return { top, right, bottom, left };
  },

  fromLTRB(left: number, top: number, right: number, bottom: number): Insets {
    return { top, right, bottom, left };
  }
});

/** Total inset along each axis, upstream's `horizontal` / `vertical` getters. */
export function insetsHorizontal(insets: Insets): number {
  return insets.left + insets.right;
}

export function insetsVertical(insets: Insets): number {
  return insets.top + insets.bottom;
}

/**
 * A point in the -1…1 alignment square, upstream's `Alignment`.
 *
 * The constant values are upstream's, so `Alignment.topLeft` is `(-1, 1)` —
 * **y grows upward** here, matching dart_pdf's PDF-space convention. The widget
 * layer is y-down (see ARCHITECTURE.md §4), so `inscribe` flips the sign rather
 * than the constants; keeping the constants means an upstream snippet reads the
 * same after porting.
 */
export interface Alignment {
  readonly x: number;
  readonly y: number;
}

export const Alignment = Object.freeze({
  topLeft: Object.freeze({ x: -1, y: 1 }) as Alignment,
  topCenter: Object.freeze({ x: 0, y: 1 }) as Alignment,
  topRight: Object.freeze({ x: 1, y: 1 }) as Alignment,
  centerLeft: Object.freeze({ x: -1, y: 0 }) as Alignment,
  center: Object.freeze({ x: 0, y: 0 }) as Alignment,
  centerRight: Object.freeze({ x: 1, y: 0 }) as Alignment,
  bottomLeft: Object.freeze({ x: -1, y: -1 }) as Alignment,
  bottomCenter: Object.freeze({ x: 0, y: -1 }) as Alignment,
  bottomRight: Object.freeze({ x: 1, y: -1 }) as Alignment
});

/** A top-left offset, the widget layer's placement unit. */
export interface Offset {
  readonly dx: number;
  readonly dy: number;
}

/**
 * Place a `childWidth` × `childHeight` box inside a `boxWidth` × `boxHeight`
 * one — upstream `Alignment.inscribe`, returning the offset instead of a rect
 * because the port's parents position children by offset.
 *
 * The `y` term is subtracted, not added: upstream inscribes in PDF space where
 * y grows upward, and this layer is y-down.
 */
export function inscribe(
  alignment: Alignment,
  childWidth: number,
  childHeight: number,
  boxWidth: number,
  boxHeight: number
): Offset {
  const halfWidthDelta = (boxWidth - childWidth) / 2;
  const halfHeightDelta = (boxHeight - childHeight) / 2;

  return {
    dx: halfWidthDelta + alignment.x * halfWidthDelta,
    dy: halfHeightDelta - alignment.y * halfHeightDelta
  };
}
