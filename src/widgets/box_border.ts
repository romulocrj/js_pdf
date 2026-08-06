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
 *   - pdf/lib/src/widgets/box_border.dart
 */

import { normalizeColor } from '../pdf/color.ts';
import type { ColorInput, Rgb } from '../pdf/color.ts';
import type { PdfCanvas } from '../pdf/graphics.ts';
import { BorderRadius } from './border_radius.ts';
import type { BoxShape } from './decoration.ts';
import type { RenderContext } from './widget.ts';

export interface BorderStyleOptions {
  readonly paint?: boolean;
  readonly pattern?: readonly number[] | null;
  readonly phase?: number;
}

/** Solid, absent or dashed line behavior for one border side. */
export class BorderStyle {
  static readonly none = new BorderStyle({ paint: false });
  static readonly solid = new BorderStyle();
  static readonly dashed = new BorderStyle({ pattern: [3, 3] });
  static readonly dotted = new BorderStyle({ pattern: [1, 1] });

  readonly paint: boolean;
  readonly pattern: readonly number[] | null;
  readonly phase: number;

  constructor({ paint = true, pattern = null, phase = 0 }: BorderStyleOptions = {}) {
    this.paint = Boolean(paint);
    this.pattern = pattern === null ? null : pattern.map(Number);
    this.phase = Number(phase);
  }

  setStyle(canvas: PdfCanvas): boolean {
    if (!this.paint || this.pattern === null) return false;
    canvas.saveContext();
    canvas.setLineCap('butt');
    canvas.setLineDashPattern(this.pattern, this.phase);
    return true;
  }

  unsetStyle(canvas: PdfCanvas, saved: boolean): void {
    if (saved) canvas.restoreContext();
  }
}

export type BorderStyleInput = BorderStyle | 'none' | 'solid' | 'dashed' | 'dotted';

function normalizeStyle(value: BorderStyleInput): BorderStyle {
  if (value instanceof BorderStyle) return value;
  return BorderStyle[value];
}

export interface BorderSideOptions {
  readonly color?: ColorInput;
  readonly width?: number;
  readonly style?: BorderStyleInput;
}

/** One immutable side of a box border. */
export class BorderSide {
  static readonly none = new BorderSide({ width: 0, style: BorderStyle.none });

  readonly color: Rgb;
  readonly width: number;
  readonly style: BorderStyle;

  constructor({ color = '#000000', width = 1, style = BorderStyle.solid }: BorderSideOptions = {}) {
    this.color = normalizeColor(color);
    this.width = Math.max(0, Number(width));
    this.style = normalizeStyle(style);
  }

  copyWith({ color, width, style }: BorderSideOptions = {}): BorderSide {
    return new BorderSide({
      color: color ?? this.color,
      width: width ?? this.width,
      style: style ?? this.style
    });
  }

  equals(other: BorderSide): boolean {
    return this.width === other.width
      && this.style.paint === other.style.paint
      && this.style.phase === other.style.phase
      && String(this.style.pattern) === String(other.style.pattern)
      && this.color[0] === other.color[0]
      && this.color[1] === other.color[1]
      && this.color[2] === other.color[2];
  }
}

export type BorderSideInput = BorderSide | BorderSideOptions;

function side(value: BorderSideInput | null | undefined): BorderSide {
  if (value === null || value === undefined) return BorderSide.none;
  return value instanceof BorderSide ? value : new BorderSide(value);
}

export interface BoxBorderPaintOptions {
  readonly shape?: BoxShape;
  readonly borderRadius?: BorderRadius | null;
}

/** Base class shared by physical box borders. */
export abstract class BoxBorder {
  abstract readonly top: BorderSide;
  abstract readonly right: BorderSide;
  abstract readonly bottom: BorderSide;
  abstract readonly left: BorderSide;
  abstract get isUniform(): boolean;

  abstract paint(
    context: RenderContext,
    x: number,
    y: number,
    width: number,
    height: number,
    options?: BoxBorderPaintOptions
  ): void;
}

export interface BorderOptions {
  readonly top?: BorderSideInput | null;
  readonly right?: BorderSideInput | null;
  readonly bottom?: BorderSideInput | null;
  readonly left?: BorderSideInput | null;
}

/** Four independently styled physical sides. */
export class Border extends BoxBorder {
  readonly top: BorderSide;
  readonly right: BorderSide;
  readonly bottom: BorderSide;
  readonly left: BorderSide;

  constructor({ top = null, right = null, bottom = null, left = null }: BorderOptions = {}) {
    super();
    this.top = side(top);
    this.right = side(right);
    this.bottom = side(bottom);
    this.left = side(left);
  }

  static all(options: BorderSideOptions = {}): Border {
    return Border.fromBorderSide(new BorderSide(options));
  }

  static fromBorderSide(value: BorderSideInput): Border {
    const resolved = side(value);
    return new Border({ top: resolved, right: resolved, bottom: resolved, left: resolved });
  }

  static symmetric({
    vertical = BorderSide.none,
    horizontal = BorderSide.none
  }: {
    readonly vertical?: BorderSideInput;
    readonly horizontal?: BorderSideInput;
  } = {}): Border {
    return new Border({
      top: horizontal,
      right: vertical,
      bottom: horizontal,
      left: vertical
    });
  }

  override get isUniform(): boolean {
    return this.top.equals(this.right)
      && this.top.equals(this.bottom)
      && this.top.equals(this.left);
  }

  private paintUniform(
    context: RenderContext,
    x: number,
    y: number,
    width: number,
    height: number,
    shape: BoxShape,
    borderRadius: BorderRadius | null
  ): void {
    const { canvas } = context;
    const value = this.top;
    if (!value.style.paint || value.width <= 0) return;
    const saved = value.style.setStyle(canvas);
    canvas.setStrokeColor(value.color);
    canvas.setLineWidth(value.width);
    canvas.setLineJoin('miter');
    canvas.setMiterLimit(4);
    if (shape === 'circle') {
      canvas.drawEllipse(
        x + width / 2,
        canvas.pageHeight - y - height / 2,
        width / 2,
        height / 2
      );
    } else if (borderRadius !== null) {
      borderRadius.paint(canvas, x, y, width, height);
    } else {
      canvas.drawRect(x, canvas.pageHeight - y - height, width, height);
    }
    canvas.strokePath();
    value.style.unsetStyle(canvas, saved);
  }

  private paintSide(
    canvas: PdfCanvas,
    value: BorderSide,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): void {
    if (!value.style.paint || value.width <= 0) return;
    const saved = value.style.setStyle(canvas);
    canvas.setStrokeColor(value.color);
    canvas.setLineWidth(value.width);
    canvas.drawLine(x1, canvas.toPdfY(y1), x2, canvas.toPdfY(y2));
    canvas.strokePath();
    value.style.unsetStyle(canvas, saved);
  }

  override paint(
    context: RenderContext,
    x: number,
    y: number,
    width: number,
    height: number,
    { shape = 'rectangle', borderRadius = null }: BoxBorderPaintOptions = {}
  ): void {
    if (this.isUniform) {
      this.paintUniform(context, x, y, width, height, shape, borderRadius);
      return;
    }
    if (shape !== 'rectangle') {
      throw new Error('A non-uniform Border can only paint a rectangle');
    }
    if (borderRadius !== null) {
      throw new Error('A border radius requires a uniform Border');
    }

    const { canvas } = context;
    canvas.setLineCap('square');
    canvas.setLineJoin('miter');
    canvas.setMiterLimit(4);
    this.paintSide(canvas, this.top, x, y, x + width, y);
    this.paintSide(canvas, this.right, x + width, y, x + width, y + height);
    this.paintSide(canvas, this.bottom, x + width, y + height, x, y + height);
    this.paintSide(canvas, this.left, x, y + height, x, y);
  }
}

export type BoxBorderInput = BoxBorder | BorderOptions | BorderSideOptions;

function isSideOptions(value: BorderOptions | BorderSideOptions): value is BorderSideOptions {
  const options = value as BorderOptions & BorderSideOptions;
  return options.top === undefined
    && options.right === undefined
    && options.bottom === undefined
    && options.left === undefined
    && (options.color !== undefined || options.width !== undefined || options.style !== undefined);
}

/**
 * Accepts either a per-side object or a single side.
 *
 * `{ color, width }` describes one side, and upstream spells that
 * `Border.all(...)`. Treating it as a `BorderOptions` instead would leave every
 * side `BorderSide.none` and silently drop the border, so the shorthand is
 * recognised here.
 */
export function normalizeBoxBorder(value: BoxBorderInput | null | undefined): BoxBorder | null {
  if (value === null || value === undefined) return null;
  if (value instanceof BoxBorder) return value;
  return isSideOptions(value) ? Border.all(value) : new Border(value);
}
