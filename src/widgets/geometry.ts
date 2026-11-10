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
 *   - pdf/lib/src/widgets/geometry.dart
 *   - pdf/lib/src/pdf/rect.dart
 */

import type { TextDirection } from './border_radius.ts';

/** Structural input accepted wherever callers historically supplied maxima. */
export interface BoxConstraintsInput {
  readonly minWidth?: number;
  readonly maxWidth?: number;
  readonly minHeight?: number;
  readonly maxHeight?: number;
}

export interface ConstraintSize {
  readonly width: number;
  readonly height: number;
}

function constraintNumber(value: number, name: string): number {
  if (Number.isNaN(value) || value < 0) {
    throw new RangeError(`${name} must be non-negative`);
  }
  return value;
}

function clampConstraint(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * The four-sided size contract used by every widget.
 *
 * This is a direct value-type port of upstream `BoxConstraints`. The static
 * factories replace Dart's named constructors, while `from()` keeps the old
 * `{ maxWidth, maxHeight }` layout probes source-compatible.
 */
export class BoxConstraints {
  readonly minWidth: number;
  readonly maxWidth: number;
  readonly minHeight: number;
  readonly maxHeight: number;

  constructor({
    minWidth = 0,
    maxWidth = Infinity,
    minHeight = 0,
    maxHeight = Infinity
  }: BoxConstraintsInput = {}) {
    this.minWidth = constraintNumber(Number(minWidth), 'minWidth');
    this.maxWidth = constraintNumber(Number(maxWidth), 'maxWidth');
    this.minHeight = constraintNumber(Number(minHeight), 'minHeight');
    this.maxHeight = constraintNumber(Number(maxHeight), 'maxHeight');
    if (this.minWidth > this.maxWidth || this.minHeight > this.maxHeight) {
      throw new RangeError('BoxConstraints minimums must not exceed maximums');
    }
  }

  static from(value: BoxConstraintsInput): BoxConstraints {
    return value instanceof BoxConstraints ? value : new BoxConstraints(value);
  }

  static tightFor({
    width = null,
    height = null
  }: {
    readonly width?: number | null;
    readonly height?: number | null;
  } = {}): BoxConstraints {
    return new BoxConstraints({
      minWidth: width ?? 0,
      maxWidth: width ?? Infinity,
      minHeight: height ?? 0,
      maxHeight: height ?? Infinity
    });
  }

  static tight(size: ConstraintSize): BoxConstraints {
    return new BoxConstraints({
      minWidth: size.width,
      maxWidth: size.width,
      minHeight: size.height,
      maxHeight: size.height
    });
  }

  static expand({
    width = Infinity,
    height = Infinity
  }: {
    readonly width?: number;
    readonly height?: number;
  } = {}): BoxConstraints {
    return BoxConstraints.tightFor({ width, height });
  }

  static tightForFinite({
    width = Infinity,
    height = Infinity
  }: {
    readonly width?: number;
    readonly height?: number;
  } = {}): BoxConstraints {
    return BoxConstraints.tightFor({
      width: Number.isFinite(width) ? width : null,
      height: Number.isFinite(height) ? height : null
    });
  }

  get hasBoundedWidth(): boolean {
    return Number.isFinite(this.maxWidth);
  }

  get hasBoundedHeight(): boolean {
    return Number.isFinite(this.maxHeight);
  }

  get hasInfiniteWidth(): boolean {
    return !Number.isFinite(this.minWidth);
  }

  get hasInfiniteHeight(): boolean {
    return !Number.isFinite(this.minHeight);
  }

  get hasTightWidth(): boolean {
    return this.minWidth >= this.maxWidth;
  }

  get hasTightHeight(): boolean {
    return this.minHeight >= this.maxHeight;
  }

  get isTight(): boolean {
    return this.hasTightWidth && this.hasTightHeight;
  }

  get biggest(): ConstraintSize {
    return { width: this.constrainWidth(), height: this.constrainHeight() };
  }

  get smallest(): ConstraintSize {
    return { width: this.constrainWidth(0), height: this.constrainHeight(0) };
  }

  constrainWidth(width = Infinity): number {
    return clampConstraint(width, this.minWidth, this.maxWidth);
  }

  constrainHeight(height = Infinity): number {
    return clampConstraint(height, this.minHeight, this.maxHeight);
  }

  constrain(size: ConstraintSize): ConstraintSize {
    return {
      width: this.constrainWidth(size.width),
      height: this.constrainHeight(size.height)
    };
  }

  constrainSizeAndAttemptToPreserveAspectRatio(size: ConstraintSize): ConstraintSize {
    if (this.isTight) return this.smallest;
    if (size.width <= 0 || size.height <= 0) return this.constrain(size);

    const ratio = size.width / size.height;
    let width = size.width;
    let height = size.height;
    if (width > this.maxWidth) {
      width = this.maxWidth;
      height = width / ratio;
    }
    if (height > this.maxHeight) {
      height = this.maxHeight;
      width = height * ratio;
    }
    if (width < this.minWidth) {
      width = this.minWidth;
      height = width / ratio;
    }
    if (height < this.minHeight) {
      height = this.minHeight;
      width = height * ratio;
    }
    return this.constrain({ width, height });
  }

  tighten({
    width = null,
    height = null
  }: {
    readonly width?: number | null;
    readonly height?: number | null;
  } = {}): BoxConstraints {
    const tightWidth = width === null
      ? null
      : clampConstraint(width, this.minWidth, this.maxWidth);
    const tightHeight = height === null
      ? null
      : clampConstraint(height, this.minHeight, this.maxHeight);
    return new BoxConstraints({
      minWidth: tightWidth ?? this.minWidth,
      maxWidth: tightWidth ?? this.maxWidth,
      minHeight: tightHeight ?? this.minHeight,
      maxHeight: tightHeight ?? this.maxHeight
    });
  }

  deflate(edges: InsetsInput): BoxConstraints {
    const insets = normalizeInsets(edges);
    const horizontal = insetsHorizontal(insets);
    const vertical = insetsVertical(insets);
    const minWidth = Math.max(0, this.minWidth - horizontal);
    const minHeight = Math.max(0, this.minHeight - vertical);
    return new BoxConstraints({
      minWidth,
      maxWidth: Math.max(minWidth, this.maxWidth - horizontal),
      minHeight,
      maxHeight: Math.max(minHeight, this.maxHeight - vertical)
    });
  }

  loosen(): BoxConstraints {
    return new BoxConstraints({
      maxWidth: this.maxWidth,
      maxHeight: this.maxHeight
    });
  }

  enforce(other: BoxConstraintsInput): BoxConstraints {
    const constraints = BoxConstraints.from(other);
    const minWidth = clampConstraint(this.minWidth, constraints.minWidth, constraints.maxWidth);
    const maxWidth = clampConstraint(this.maxWidth, constraints.minWidth, constraints.maxWidth);
    const minHeight = clampConstraint(this.minHeight, constraints.minHeight, constraints.maxHeight);
    const maxHeight = clampConstraint(this.maxHeight, constraints.minHeight, constraints.maxHeight);
    if (Object.is(minWidth, this.minWidth) && Object.is(maxWidth, this.maxWidth)
        && Object.is(minHeight, this.minHeight) && Object.is(maxHeight, this.maxHeight)) return this;
    return new BoxConstraints({ minWidth, maxWidth, minHeight, maxHeight });
  }

  copyWith(values: BoxConstraintsInput = {}): BoxConstraints {
    return new BoxConstraints({
      minWidth: values.minWidth ?? this.minWidth,
      maxWidth: values.maxWidth ?? this.maxWidth,
      minHeight: values.minHeight ?? this.minHeight,
      maxHeight: values.maxHeight ?? this.maxHeight
    });
  }
}

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
  | Partial<Insets> & {
    readonly all?: number;
    readonly vertical?: number;
    readonly horizontal?: number;
    /** Directional sides, upstream's `EdgeInsetsDirectional`; see `InsetsDirectional`. */
    readonly start?: number;
    readonly end?: number;
  };

/**
 * Upstream's `EdgeInsetsDirectional`: `start` is the side text starts on, the
 * left under ltr and the right under rtl. `left` and `right` may ride along,
 * which is upstream's `_MixedEdgeInsets`; `resolveInsets` adds them.
 */
export interface InsetsDirectional {
  readonly top: number;
  readonly start: number;
  readonly end: number;
  readonly bottom: number;
  readonly left?: number;
  readonly right?: number;
}

/** Upstream's `EdgeInsetsGeometry`: physical or directional insets. */
export type InsetsGeometry = Insets | InsetsDirectional;

export function normalizeInsets(value: InsetsInput = 0): Insets {
  if (typeof value === 'number') {
    return { top: value, right: value, bottom: value, left: value };
  }

  const all = value.all;
  return {
    top: Number(value.top ?? value.vertical ?? all ?? 0),
    right: Number(value.right ?? value.horizontal ?? all ?? 0),
    bottom: Number(value.bottom ?? value.vertical ?? all ?? 0),
    left: Number(value.left ?? value.horizontal ?? all ?? 0)
  };
}

/**
 * Normalise insets without choosing a direction: physical input gives `Insets`
 * exactly as `normalizeInsets` does, and input naming `start` or `end` keeps
 * them for `resolveInsets` to place once the direction is known.
 */
export function normalizeInsetsGeometry(value: InsetsInput = 0): InsetsGeometry {
  if (typeof value === 'number' || value.start == null && value.end == null) return normalizeInsets(value);
  const { top, bottom } = normalizeInsets(value);
  const side = (own: number | undefined): number => Number(own ?? value.horizontal ?? value.all ?? 0);
  return {
    top,
    start: side(value.start),
    end: side(value.end),
    bottom,
    left: Number(value.left ?? 0),
    right: Number(value.right ?? 0)
  };
}

/**
 * Upstream's `EdgeInsetsGeometry.resolve`, as a function because the port's
 * insets are plain objects. Physical insets are returned as they are; with no
 * direction this resolves as ltr, the fallback of `Directionality.of`.
 */
export function resolveInsets(value: InsetsGeometry, direction?: TextDirection | null): Insets {
  if (!('start' in value)) return value;
  const rtl = direction === 'rtl';
  return {
    top: value.top,
    right: (value.right ?? 0) + (rtl ? value.start : value.end),
    bottom: value.bottom,
    left: (value.left ?? 0) + (rtl ? value.end : value.start)
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
export interface EdgeInsetsConstructor {
  new(value?: InsetsInput): Insets;
  readonly zero: Insets;
  all(value: number): Insets;
  symmetric(options?: { readonly vertical?: number; readonly horizontal?: number }): Insets;
  only(options?: Partial<Insets>): Insets;
  fromLTRB(left: number, top: number, right: number, bottom: number): Insets;
}

function edgeInsetsConstructor(value: InsetsInput = 0): Insets {
  return normalizeInsets(value);
}

export const EdgeInsets = Object.freeze(Object.assign(edgeInsetsConstructor, {
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
})) as unknown as EdgeInsetsConstructor;

/** Upstream's `EdgeInsetsDirectional` named constructors, shaped like `EdgeInsets`. */
export const EdgeInsetsDirectional = Object.freeze({
  zero: Object.freeze({ top: 0, start: 0, end: 0, bottom: 0 }) as InsetsDirectional,

  all(value: number): InsetsDirectional {
    return { top: value, start: value, end: value, bottom: value };
  },

  symmetric({ vertical = 0, horizontal = 0 }: { vertical?: number; horizontal?: number } = {}): InsetsDirectional {
    return { top: vertical, start: horizontal, end: horizontal, bottom: vertical };
  },

  only({ start = 0, top = 0, end = 0, bottom = 0 }: Partial<InsetsDirectional> = {}): InsetsDirectional {
    return { top, start, end, bottom };
  },

  fromSTEB(start: number, top: number, end: number, bottom: number): InsetsDirectional {
    return { top, start, end, bottom };
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

/**
 * Upstream's `AlignmentDirectional`: `start` is -1 on the side text starts on.
 *
 * Its `y` follows `Alignment`, **y up**, so `topStart` is `(-1, 1)` and each
 * constant resolves to the physical one of the same name. Upstream copied
 * Flutter's y-down constants beside its own y-up `Alignment`, which put
 * `topStart` at the bottom of the box until PR #1980 (CHANGELOG L85).
 */
export interface AlignmentDirectional {
  readonly start: number;
  readonly y: number;
}

/** Upstream's `AlignmentGeometry`: a physical or a directional alignment. */
export type AlignmentGeometry = Alignment | AlignmentDirectional;

export type AlignmentDirectionalName =
  | 'topStart'
  | 'topCenter'
  | 'topEnd'
  | 'centerStart'
  | 'center'
  | 'centerEnd'
  | 'bottomStart'
  | 'bottomCenter'
  | 'bottomEnd';

/**
 * Derived from `Alignment` rather than spelled out: left becomes start and
 * right becomes end, so the two tables cannot disagree about `y`.
 */
export const AlignmentDirectional = Object.freeze(Object.fromEntries(
  Object.entries(Alignment).map(([name, { x, y }]) => [
    name.replace('Left', 'Start').replace('Right', 'End'),
    Object.freeze({ start: x, y })
  ])
)) as Readonly<Record<AlignmentDirectionalName, AlignmentDirectional>>;

/**
 * Upstream's `AlignmentGeometry.resolve`; a physical alignment is returned as
 * it is. `0 - start` rather than `-start`, so a centred one stays `+0`.
 */
export function resolveAlignment(value: AlignmentGeometry, direction?: TextDirection | null): Alignment {
  return 'start' in value ? { x: direction === 'rtl' ? 0 - value.start : value.start, y: value.y } : value;
}

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
