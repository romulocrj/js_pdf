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
 *   - pdf/lib/src/widgets/chart/grid_axis.dart
 */

import { assertFiniteNumber } from '../../base/assert.ts';
import { normalizeColor } from '../../pdf/color.ts';
import type { ColorInput, Rgb } from '../../pdf/color.ts';
import { Transform } from '../basic.ts';
import type { Axis } from '../flex.ts';
import { Alignment, BoxConstraints } from '../geometry.ts';
import type { ConstraintSize } from '../geometry.ts';
import { Text } from '../text.ts';
import type { TextStyle } from '../text_style.ts';
import type { AnyWidget, RenderContext } from '../widget.ts';
import { CHART_BLACK, drawWidget } from './chart.ts';
import type { CartesianFrame } from './grid_cartesian.ts';

/** Upstream `PdfColors.grey`, the default division color. */
const GREY = '#9e9e9e';

export type GridAxisFormat = (value: number) => string;
export type GridAxisBuildLabel = (value: number) => AnyWidget;

export interface GridAxisOptions {
  readonly format?: GridAxisFormat | null;
  readonly buildLabel?: GridAxisBuildLabel | null;
  readonly textStyle?: TextStyle | null;
  readonly margin?: number | null;
  readonly marginStart?: number | null;
  readonly marginEnd?: number | null;
  readonly color?: ColorInput | null;
  readonly width?: number | null;
  readonly divisions?: boolean | null;
  readonly divisionsWidth?: number | null;
  readonly divisionsColor?: ColorInput | null;
  readonly divisionsDashed?: boolean | null;
  readonly ticks?: boolean | null;
  readonly axisTick?: boolean | null;
  readonly angle?: number;
}

/** What laying an axis out produced. Upstream keeps these on the axis widget. */
export interface AxisLayout {
  readonly direction: Axis;
  readonly axisPosition: number;
  readonly crossAxisPosition: number;
  readonly marginEnd: number;
  readonly textMargin: number;
  readonly axisTick: boolean;
  /** The axis box: `size.x × axisPosition` lying along the bottom, or the transpose. */
  readonly boxWidth: number;
  readonly boxHeight: number;
}

/** The incoming half of the cartesian grid's two-axis convergence loop. */
export interface AxisPositions {
  readonly axisPosition: number;
  readonly crossAxisPosition: number;
  readonly marginEnd: number;
}

/**
 * One axis of a cartesian grid.
 *
 * `direction` is a mutable field upstream, assigned by `CartesianGrid` before
 * layout. Assigning to the widget would be layout state on `this`, so the port
 * passes it into `layout` and carries it in `AxisLayout` instead.
 */
export abstract class GridAxis {
  readonly format: GridAxisFormat;
  readonly buildLabel: GridAxisBuildLabel | null;
  readonly textStyle: TextStyle | null;
  readonly margin: number | null;
  readonly marginStart: number;
  readonly marginEnd: number;
  readonly color: Rgb;
  readonly width: number;
  readonly divisions: boolean;
  readonly divisionsWidth: number;
  readonly divisionsColor: Rgb;
  readonly divisionsDashed: boolean;
  readonly ticks: boolean;
  readonly axisTick: boolean | null;
  readonly angle: number;

  constructor({
    format = null,
    buildLabel = null,
    textStyle = null,
    margin = null,
    marginStart = null,
    marginEnd = null,
    color = null,
    width = null,
    divisions = null,
    divisionsWidth = null,
    divisionsColor = null,
    divisionsDashed = null,
    ticks = null,
    axisTick = null,
    angle = 0
  }: GridAxisOptions = {}) {
    this.format = format ?? (value => String(value));
    this.buildLabel = buildLabel;
    this.textStyle = textStyle;
    this.margin = margin === null ? null : Number(margin);
    this.marginStart = marginStart ?? 0;
    this.marginEnd = marginEnd ?? 0;
    this.color = normalizeColor(color ?? CHART_BLACK);
    this.width = width ?? 1;
    this.divisions = divisions ?? false;
    this.divisionsWidth = divisionsWidth ?? 0.5;
    this.divisionsColor = normalizeColor(divisionsColor ?? GREY);
    this.divisionsDashed = divisionsDashed ?? false;
    this.ticks = ticks ?? false;
    this.axisTick = axisTick;
    this.angle = assertFiniteNumber(Number(angle), 'angle');
  }

  transfer(input: number): number {
    return input;
  }

  /** The widget drawn for one value, upstream `_text`. */
  protected label(value: number): AnyWidget {
    const text = this.buildLabel === null
      ? new Text(this.format(value), this.textStyle === null ? {} : { style: this.textStyle })
      : this.buildLabel(value);
    if (this.angle === 0) return text;
    return new Transform({ rotateBox: this.angle, child: text });
  }

  /** Upstream `_angleDirection`. */
  protected angleDirection(): number {
    if (this.angle === 0) return 0;
    if (this.angle % Math.PI > Math.PI / 2) return -1;
    return 1;
  }

  abstract layout(
    context: RenderContext,
    direction: Axis,
    size: ConstraintSize,
    incoming: AxisPositions
  ): AxisLayout;

  abstract toChart(input: number, layout: AxisLayout): number;

  abstract paintBackground(context: RenderContext, frame: CartesianFrame, layout: AxisLayout): void;

  abstract paint(context: RenderContext, frame: CartesianFrame, layout: AxisLayout): void;
}

export interface FixedAxisOptions extends GridAxisOptions {}

/** An axis with an explicit, ascending list of values. */
export class FixedAxis extends GridAxis {
  readonly values: readonly number[];

  constructor(values: readonly number[], options: FixedAxisOptions = {}) {
    super(options);
    this.values = values.map((value, index) => assertFiniteNumber(Number(value), `values[${index}]`));
    if (!FixedAxis.isSortedAscending(this.values)) {
      throw new RangeError('FixedAxis values must be sorted ascending');
    }
  }

  /** Upstream `FixedAxis.fromStrings`: indices as values, labels as format. */
  static fromStrings(values: readonly string[], options: FixedAxisOptions = {}): FixedAxis {
    const labels = values.map(value => String(value));
    return new FixedAxis(labels.map((_, index) => index), {
      ...options,
      format: value => labels[Math.trunc(value)] ?? String(value)
    });
  }

  private static isSortedAscending(values: readonly number[]): boolean {
    let previous = values[0] ?? 0;
    for (const value of values) {
      if (previous > value) return false;
      previous = value;
    }
    return true;
  }

  override layout(
    context: RenderContext,
    direction: Axis,
    size: ConstraintSize,
    incoming: AxisPositions
  ): AxisLayout {
    let maxWidth = 0;
    let maxHeight = 0;
    let first: ConstraintSize | null = null;
    let last: ConstraintSize | null = null;

    for (const value of this.values) {
      const measured = this.label(value).layout(context, new BoxConstraints());
      last = { width: measured.width, height: measured.height };
      maxWidth = Math.max(maxWidth, last.width);
      maxHeight = Math.max(maxHeight, last.height);
      if (first === null) first = last;
    }

    const firstSize = first ?? { width: 0, height: 0 };
    const lastSize = last ?? { width: 0, height: 0 };
    const ad = this.angleDirection();

    if (direction === 'horizontal') {
      const textMargin = this.margin ?? 2;
      const minStart = ad === 0 ? firstSize.width / 2 : (ad > 0 ? firstSize.width : 0);
      const marginEnd = Math.max(incoming.marginEnd, ad === 0 ? lastSize.width / 2 : (ad > 0 ? 0 : lastSize.width));
      const crossAxisPosition = Math.max(incoming.crossAxisPosition, minStart);
      const axisPosition = Math.max(incoming.axisPosition, maxHeight + textMargin);

      return {
        direction,
        axisPosition,
        crossAxisPosition,
        marginEnd,
        textMargin,
        axisTick: this.axisTick ?? false,
        boxWidth: size.width,
        boxHeight: axisPosition
      };
    }

    const textMargin = this.margin ?? 10;
    // Upstream measures the vertical axis' end margin against the last label's
    // *width*; kept as-is so the grid box matches dart_pdf to the point.
    const marginEnd = Math.max(incoming.marginEnd, ad === 0 ? lastSize.width / 2 : (ad < 0 ? lastSize.width : 0));
    const minStart = ad === 0 ? firstSize.height / 2 : (ad > 0 ? firstSize.width : 0);
    const crossAxisPosition = Math.max(incoming.crossAxisPosition, minStart);
    const axisPosition = Math.max(incoming.axisPosition, maxWidth + textMargin);

    return {
      direction,
      axisPosition,
      crossAxisPosition,
      marginEnd,
      textMargin,
      axisTick: this.axisTick ?? true,
      boxWidth: axisPosition,
      boxHeight: size.height
    };
  }

  override toChart(input: number, layout: AxisLayout): number {
    const offset = this.transfer(this.values[0] ?? 0);
    const total = this.transfer(this.values[this.values.length - 1] ?? 0) - offset;
    const start = layout.crossAxisPosition + this.marginStart;
    const extent = layout.direction === 'horizontal' ? layout.boxWidth : layout.boxHeight;
    if (total === 0) return start;
    return start + (extent - start - layout.marginEnd) * (this.transfer(input) - offset) / total;
  }

  override paintBackground(context: RenderContext, frame: CartesianFrame, layout: AxisLayout): void {
    if (!this.divisions) return;

    const canvas = context.canvas;
    const grid = frame.gridBox;
    const values = this.values.slice(this.marginStart > 0 ? 0 : 1);

    if (layout.direction === 'horizontal') {
      for (const value of values) {
        const p = this.toChart(value, layout);
        canvas.drawLine(frame.px(p), frame.py(grid.bottom + grid.height), frame.px(p), frame.py(grid.bottom));
      }
    } else {
      for (const value of values) {
        const p = this.toChart(value, layout);
        canvas.drawLine(frame.px(grid.left), frame.py(p), frame.px(grid.left + grid.width), frame.py(p));
      }
    }

    if (this.divisionsDashed) canvas.setLineDashPattern([4, 2]);
    canvas.setStrokeColor(this.divisionsColor);
    canvas.setLineWidth(this.divisionsWidth);
    canvas.setLineJoin('miter');
    canvas.strokePath();
    if (this.divisionsDashed) canvas.setLineDashPattern();
  }

  override paint(context: RenderContext, frame: CartesianFrame, layout: AxisLayout): void {
    if (layout.direction === 'horizontal') {
      this.drawXValues(context, frame, layout);
    } else {
      this.drawYValues(context, frame, layout);
    }
  }

  private drawXValues(context: RenderContext, frame: CartesianFrame, layout: AxisLayout): void {
    const canvas = context.canvas;
    const axis = layout.axisPosition;

    canvas.moveTo(frame.px(layout.crossAxisPosition), frame.py(axis));
    canvas.lineTo(frame.px(layout.boxWidth), frame.py(axis));

    if (layout.axisTick && layout.textMargin > 0) {
      canvas.moveTo(frame.px(layout.crossAxisPosition), frame.py(axis));
      canvas.lineTo(frame.px(layout.crossAxisPosition), frame.py(axis - layout.textMargin));
    }

    if (this.ticks && layout.textMargin > 0) {
      for (const value of this.values) {
        const p = this.toChart(value, layout);
        canvas.moveTo(frame.px(p), frame.py(axis));
        canvas.lineTo(frame.px(p), frame.py(axis - layout.textMargin));
      }
    }

    canvas.setStrokeColor(this.color);
    canvas.setLineWidth(this.width);
    canvas.setLineJoin('bevel');
    canvas.strokePath();

    const ad = this.angleDirection();
    const alignment = ad === 0 ? Alignment.topCenter : (ad > 0 ? Alignment.topRight : Alignment.topLeft);

    for (const value of this.values) {
      const p = this.toChart(value, layout);
      drawWidget(context, this.label(value), frame.px(p), frame.top(axis - layout.textMargin), alignment);
    }
  }

  private drawYValues(context: RenderContext, frame: CartesianFrame, layout: AxisLayout): void {
    const canvas = context.canvas;
    const axis = layout.axisPosition;

    canvas.moveTo(frame.px(axis), frame.py(layout.boxHeight));
    canvas.lineTo(frame.px(axis), frame.py(layout.crossAxisPosition));

    if (layout.axisTick && layout.textMargin > 0) {
      canvas.moveTo(frame.px(axis), frame.py(layout.crossAxisPosition));
      canvas.lineTo(frame.px(axis - layout.textMargin / 2), frame.py(layout.crossAxisPosition));
    }

    if (this.ticks && layout.textMargin > 0) {
      for (const value of this.values) {
        const p = this.toChart(value, layout);
        canvas.moveTo(frame.px(axis), frame.py(p));
        canvas.lineTo(frame.px(axis - layout.textMargin / 2), frame.py(p));
      }
    }

    canvas.setStrokeColor(this.color);
    canvas.setLineWidth(this.width);
    canvas.setLineJoin('bevel');
    canvas.strokePath();

    const ad = this.angleDirection();
    const alignment = ad === 0 ? Alignment.centerRight : (ad > 0 ? Alignment.topRight : Alignment.bottomRight);

    for (const value of this.values) {
      const p = this.toChart(value, layout);
      drawWidget(context, this.label(value), frame.px(axis - layout.textMargin), frame.top(p), alignment);
    }
  }
}
