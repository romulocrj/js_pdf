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

import { normalizeColor } from '../pdf/color.ts';
import type { ColorInput, Rgb } from '../pdf/color.ts';
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

function hueFor(red: number, green: number, blue: number, maximum: number, delta: number): number {
  if (delta === 0 || maximum === 0) return 0;
  let hue: number;
  if (maximum === red) {
    hue = 60 * (((green - blue) / delta) % 6);
  } else if (maximum === green) {
    hue = 60 * (((blue - red) / delta) + 2);
  } else {
    hue = 60 * (((red - green) / delta) + 4);
  }
  return hue < 0 ? hue + 360 : hue;
}

/** Upstream `PdfColor.shade`, kept private until the wider color API is ported. */
function shadeColor(color: ColorInput, strength: number): Rgb {
  const [red, green, blue] = normalizeColor(color);
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  const hue = hueFor(red, green, blue, maximum, delta);
  const lightness = (maximum + minimum) / 2;
  const saturation = lightness === 1
    ? 0
    : Math.min(1, Math.max(0, delta / (1 - Math.abs(2 * lightness - 1))));
  const shadedLightness = Math.min(1, Math.max(0, lightness * (1.5 - strength)));
  const chroma = (1 - Math.abs(2 * shadedLightness - 1)) * saturation;
  const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = shadedLightness - chroma / 2;
  let resolved: Rgb;
  if (hue < 60) resolved = [chroma, secondary, 0];
  else if (hue < 120) resolved = [secondary, chroma, 0];
  else if (hue < 180) resolved = [0, chroma, secondary];
  else if (hue < 240) resolved = [0, secondary, chroma];
  else if (hue < 300) resolved = [secondary, 0, chroma];
  else resolved = [chroma, 0, secondary];
  return [
    Math.min(1, Math.max(0, resolved[0] + match)),
    Math.min(1, Math.max(0, resolved[1] + match)),
    Math.min(1, Math.max(0, resolved[2] + match))
  ];
}

export interface CircularProgressIndicatorOptions {
  readonly value: number;
  readonly color?: ColorInput | null;
  readonly strokeWidth?: number;
  readonly backgroundColor?: ColorInput | null;
}

/** A determinate circular progress ring. */
export class CircularProgressIndicator extends Widget<null> {
  readonly value: number;
  readonly color: ColorInput | null;
  readonly strokeWidth: number;
  readonly backgroundColor: ColorInput | null;

  constructor({
    value,
    color = null,
    strokeWidth = 4,
    backgroundColor = null
  }: CircularProgressIndicatorOptions) {
    super();
    this.value = finiteNumber(value, 'CircularProgressIndicator.value');
    this.color = color;
    this.strokeWidth = nonNegativeNumber(strokeWidth, 'CircularProgressIndicator.strokeWidth');
    this.backgroundColor = backgroundColor;
  }

  override layout(_context: RenderContext, constraints: Constraints): LayoutBox<null> {
    const size = BoxConstraints.from(constraints).biggest;
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
}

/** A determinate material-design progress bar. */
export class LinearProgressIndicator extends Widget<null> {
  readonly value: number;
  readonly backgroundColor: ColorInput | null;
  readonly valueColor: ColorInput | null;
  readonly minHeight: number | null;

  constructor({
    value,
    backgroundColor = null,
    valueColor = null,
    minHeight = null
  }: LinearProgressIndicatorOptions) {
    super();
    this.value = finiteNumber(value, 'LinearProgressIndicator.value');
    this.backgroundColor = backgroundColor;
    this.valueColor = valueColor;
    this.minHeight = minHeight === null
      ? null
      : nonNegativeNumber(minHeight, 'LinearProgressIndicator.minHeight');
  }

  override layout(_context: RenderContext, constraints: Constraints): LayoutBox<null> {
    const size = new BoxConstraints({
      minWidth: Infinity,
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
