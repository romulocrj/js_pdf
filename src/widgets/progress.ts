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
 *   - pdf/lib/src/widgets/progress.dart
 */

import { normalizeColor, PdfColor } from '../pdf/color.ts';
import type { ColorInput } from '../pdf/color.ts';
import { BoxConstraints } from './geometry.ts';
import { Widget } from './widget.ts';
import type { Constraints, LayoutBox, PositionedBox, RenderContext } from './widget.ts';

const DEFAULT_CIRCULAR_COLOR = '#3f51b5';
const DEFAULT_LINEAR_COLOR = '#2196f3';

function finiteNumber(value: number, name: string): number {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return resolved;
}

function nonNegativeNumber(value: number, name: string): number {
  const resolved = finiteNumber(value, name);
  if (resolved < 0) {
    throw new RangeError(`${name} must be non-negative`);
  }
  return resolved;
}

function optionalSize(value: number | null, name: string): number | null {
  return value === null ? null : nonNegativeNumber(value, name);
}

/*
 * The size on one axis: the parent's maximum when it is bounded, otherwise the
 * widget's fallback (upstream PR #1980). Both indicators used to take the
 * maximum verbatim, so inside a Row the content stream carried `Infinity`.
 */
function boundedSize(maximum: number, fallback: number | null, widget: string, option: string): number {
  if (Number.isFinite(maximum)) return maximum;
  if (fallback === null) {
    throw new RangeError(`${widget} is unbounded; give it ${option} or a parent that constrains it`);
  }
  return fallback;
}

/**
 * Use the public upstream color conversion, including its achromatic guard.
 * `shade` drops the alpha, upstream too; the track keeps the value colour's,
 * now that a fill paints it, so a translucent bar is not laid on an opaque track.
 */
function shadeColor(color: ColorInput, strength: number): PdfColor {
  const [red, green, blue] = normalizeColor(new PdfColor(...normalizeColor(color)).shade(strength));
  return new PdfColor(red, green, blue, color instanceof PdfColor ? color.alpha : 1);
}

export interface CircularProgressIndicatorOptions {
  readonly value: number;
  readonly color?: ColorInput | null;
  readonly strokeWidth?: number;
  readonly backgroundColor?: ColorInput | null;
  /** The width to take when the parent leaves the width unbounded. */
  readonly fallbackWidth?: number | null;
  /** The height to take when the parent leaves the height unbounded. */
  readonly fallbackHeight?: number | null;
}

/** A determinate circular progress ring. */
export class CircularProgressIndicator extends Widget<null> {
  readonly value: number;
  readonly color: ColorInput | null;
  readonly strokeWidth: number;
  readonly backgroundColor: ColorInput | null;
  readonly fallbackWidth: number | null;
  readonly fallbackHeight: number | null;

  constructor({
    value,
    color = null,
    strokeWidth = 4,
    backgroundColor = null,
    fallbackWidth = null,
    fallbackHeight = null
  }: CircularProgressIndicatorOptions) {
    super();
    this.value = finiteNumber(value, 'CircularProgressIndicator.value');
    this.color = color;
    this.strokeWidth = nonNegativeNumber(strokeWidth, 'CircularProgressIndicator.strokeWidth');
    this.backgroundColor = backgroundColor;
    this.fallbackWidth = optionalSize(fallbackWidth, 'CircularProgressIndicator.fallbackWidth');
    this.fallbackHeight = optionalSize(fallbackHeight, 'CircularProgressIndicator.fallbackHeight');
  }

  override layout(_context: RenderContext, constraints: Constraints): LayoutBox<null> {
    const parent = BoxConstraints.from(constraints);
    const name = 'CircularProgressIndicator';
    const size = parent.constrain({
      width: boundedSize(parent.maxWidth, this.fallbackWidth, name, 'fallbackWidth'),
      height: boundedSize(parent.maxHeight, this.fallbackHeight, name, 'fallbackHeight')
    });
    return { widget: this, width: size.width, height: size.height, data: null };
  }

  override paint(context: RenderContext, box: PositionedBox<null>): void {
    const adjustedValue = Math.min(0.99999, Math.max(0.00001, this.value));
    const left = box.x;
    const bottom = context.canvas.pageHeight - box.y - box.height;
    const rx = box.width / 2;
    const ry = box.height / 2;
    const angleStart = Math.PI / 2;
    const angleEnd = angleStart - Math.PI * 2 * adjustedValue;
    const startTop = {
      x: left + rx + Math.cos(angleStart) * rx,
      y: bottom + ry + Math.sin(angleStart) * ry
    };
    const endTop = {
      x: left + rx + Math.cos(angleEnd) * rx,
      y: bottom + ry + Math.sin(angleEnd) * ry
    };
    const startBottom = {
      x: left + rx + Math.cos(angleStart) * (rx - this.strokeWidth),
      y: bottom + ry + Math.sin(angleStart) * (ry - this.strokeWidth)
    };
    const endBottom = {
      x: left + rx + Math.cos(angleEnd) * (rx - this.strokeWidth),
      y: bottom + ry + Math.sin(angleEnd) * (ry - this.strokeWidth)
    };
    const { canvas } = context;

    if (this.backgroundColor !== null && this.value < 1) {
      canvas.moveTo(startTop.x, startTop.y);
      canvas.bezierArc(startTop.x, startTop.y, rx, ry, endTop.x, endTop.y, {
        large: adjustedValue < 0.5,
        sweep: true
      });
      canvas.lineTo(endBottom.x, endBottom.y);
      canvas.bezierArc(
        endBottom.x,
        endBottom.y,
        rx - this.strokeWidth,
        ry - this.strokeWidth,
        startBottom.x,
        startBottom.y,
        { large: adjustedValue < 0.5 }
      );
      canvas.lineTo(startTop.x, startTop.y);
      canvas.setFillColor(this.backgroundColor);
      canvas.fillPath();
    }

    if (this.value > 0) {
      canvas.moveTo(startTop.x, startTop.y);
      canvas.bezierArc(startTop.x, startTop.y, rx, ry, endTop.x, endTop.y, {
        large: adjustedValue > 0.5
      });
      canvas.lineTo(endBottom.x, endBottom.y);
      canvas.bezierArc(
        endBottom.x,
        endBottom.y,
        rx - this.strokeWidth,
        ry - this.strokeWidth,
        startBottom.x,
        startBottom.y,
        { large: adjustedValue > 0.5, sweep: true }
      );
      canvas.lineTo(startTop.x, startTop.y);
      canvas.setFillColor(this.color ?? DEFAULT_CIRCULAR_COLOR);
      canvas.fillPath();
    }
  }
}

export interface LinearProgressIndicatorOptions {
  readonly value: number;
  readonly backgroundColor?: ColorInput | null;
  readonly valueColor?: ColorInput | null;
  readonly minHeight?: number | null;
  /** The width to take when the parent leaves the width unbounded. */
  readonly fallbackWidth?: number | null;
}

/** A determinate material-design progress bar. */
export class LinearProgressIndicator extends Widget<null> {
  readonly value: number;
  readonly backgroundColor: ColorInput | null;
  readonly valueColor: ColorInput | null;
  readonly minHeight: number | null;
  readonly fallbackWidth: number | null;

  constructor({
    value,
    backgroundColor = null,
    valueColor = null,
    minHeight = null,
    fallbackWidth = null
  }: LinearProgressIndicatorOptions) {
    super();
    this.value = finiteNumber(value, 'LinearProgressIndicator.value');
    this.backgroundColor = backgroundColor;
    this.valueColor = valueColor;
    this.minHeight = optionalSize(minHeight, 'LinearProgressIndicator.minHeight');
    this.fallbackWidth = optionalSize(fallbackWidth, 'LinearProgressIndicator.fallbackWidth');
  }

  override layout(_context: RenderContext, constraints: Constraints): LayoutBox<null> {
    // `minWidth: Infinity` was an "as wide as possible" sentinel that enforce()
    // keeps when the incoming width is unbounded.
    const size = new BoxConstraints({
      minWidth: boundedSize(constraints.maxWidth, this.fallbackWidth, 'LinearProgressIndicator', 'fallbackWidth'),
      minHeight: this.minHeight ?? 4
    }).enforce(constraints).smallest;
    return { widget: this, width: size.width, height: size.height, data: null };
  }

  override paint(context: RenderContext, box: PositionedBox<null>): void {
    const value = Math.min(1, Math.max(0, this.value));
    const valueColor = this.valueColor ?? DEFAULT_LINEAR_COLOR;
    const backgroundColor = this.backgroundColor ?? shadeColor(valueColor, 0.1);
    const bottom = context.canvas.pageHeight - box.y - box.height;

    if (value < 1) {
      const epsilon = value === 0 ? 0 : 0.01;
      context.canvas.drawRect(
        box.x + box.width * value - epsilon,
        bottom,
        box.width * (1 - value) + epsilon,
        box.height
      );
      context.canvas.setFillColor(backgroundColor);
      context.canvas.fillPath();
    }

    if (value > 0) {
      context.canvas.drawRect(box.x, bottom, box.width * value, box.height);
      context.canvas.setFillColor(valueColor);
      context.canvas.fillPath();
    }
  }
}
