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
 *   - pdf/lib/src/widgets/chart/bar_chart.dart
 */

import { normalizeColor } from '../../pdf/color.ts';
import type { ColorInput, Rgb } from '../../pdf/color.ts';
import { PdfGraphicState } from '../../pdf/graphic_state.ts';
import { Border } from '../box_border.ts';
import { Container } from '../container.ts';
import { BoxDecoration } from '../decoration.ts';
import type { Axis } from '../flex.ts';
import type { ConstraintSize } from '../geometry.ts';
import type { AnyWidget, RenderContext } from '../widget.ts';
import { CHART_BLACK, CHART_BLUE, ChartFrame } from './chart.ts';
import type { ChartPoint, ChartRect } from './chart.ts';
import { CartesianFrame } from './grid_cartesian.ts';
import { PointDataSet } from './point_chart.ts';
import type { PointChartValue, PointDataSetOptions, ValuePosition } from './point_chart.ts';

export interface BarDataSetOptions extends PointDataSetOptions {
  readonly drawBorder?: boolean | null;
  readonly drawSurface?: boolean;
  readonly surfaceOpacity?: number;
  readonly width?: number;
  readonly offset?: number;
  readonly axis?: Axis;
  readonly pointColor?: ColorInput | null;
}

/** Rectangles from the axis to each value. */
export class BarDataSet extends PointDataSet {
  readonly drawBorder: boolean;
  readonly drawSurface: boolean;
  readonly surfaceOpacity: number;
  readonly barWidth: number;
  readonly offset: number;
  readonly axis: Axis;
  readonly surfaceColor: Rgb;

  constructor({
    data,
    legend = null,
    borderColor = null,
    borderWidth = 1.5,
    color = CHART_BLUE,
    drawBorder = null,
    drawSurface = true,
    surfaceOpacity = 1,
    width = 10,
    offset = 0,
    axis = 'horizontal',
    pointColor = null,
    pointSize = 3,
    drawPoints = false,
    shape = null,
    buildValue = null,
    valuePosition = 'auto'
  }: BarDataSetOptions) {
    super({
      data,
      legend,
      color: pointColor ?? color,
      borderColor,
      borderWidth,
      pointSize,
      drawPoints,
      shape,
      buildValue,
      valuePosition
    });
    this.surfaceColor = normalizeColor(color);
    const border = normalizeColor(borderColor ?? CHART_BLACK);
    this.drawBorder = drawBorder ?? (
      borderColor !== null && borderColor !== undefined
      && (border[0] !== this.surfaceColor[0] || border[1] !== this.surfaceColor[1] || border[2] !== this.surfaceColor[2])
    );
    if (!this.drawBorder && !drawSurface) {
      throw new Error('BarDataSet must draw its surface or its border');
    }
    this.drawSurface = Boolean(drawSurface);
    this.surfaceOpacity = Number(surfaceOpacity);
    this.barWidth = Number(width);
    this.offset = Number(offset);
    this.axis = axis;
  }

  override legendShape(context: RenderContext): AnyWidget {
    if (this.shape !== null) return this.shape(context);
    return new Container({
      decoration: new BoxDecoration({
        color: this.surfaceColor,
        border: Border.all({ color: this.borderColor ?? CHART_BLACK, width: this.borderWidth })
      })
    });
  }

  private drawBar(context: RenderContext, frame: ChartFrame, value: PointChartValue): void {
    const canvas = context.canvas;
    const cartesian = frame instanceof CartesianFrame ? frame : null;

    if (this.axis === 'horizontal') {
      const base = cartesian === null ? 0 : cartesian.xAxisOffset;
      const p = frame.toChart(value.point);
      const x = p.x + this.offset - this.barWidth / 2;
      canvas.drawRect(frame.px(x), frame.py(base), this.barWidth, p.y - base);
      return;
    }

    const base = cartesian === null ? 0 : cartesian.yAxisOffset;
    const p = frame.toChart(value.point);
    const y = p.y + this.offset - this.barWidth / 2;
    canvas.drawRect(frame.px(base), frame.py(y), p.x - base, this.barWidth);
  }

  override paint(context: RenderContext, frame: ChartFrame, _data: null): void {
    if (this.data.length === 0) return;

    const canvas = context.canvas;

    if (this.drawSurface) {
      for (const value of this.data) this.drawBar(context, frame, value);

      if (this.surfaceOpacity !== 1) {
        canvas.saveContext();
        canvas.setGraphicState(new PdfGraphicState({ opacity: this.surfaceOpacity }));
      }

      canvas.setFillColor(this.surfaceColor);
      canvas.fillPath();

      if (this.surfaceOpacity !== 1) canvas.restoreContext();
    }

    if (this.drawBorder) {
      for (const value of this.data) this.drawBar(context, frame, value);

      canvas.setStrokeColor(this.borderColor ?? this.surfaceColor);
      canvas.setLineWidth(this.borderWidth);
      canvas.strokePath();
    }
  }

  override automaticValuePosition(
    point: ChartPoint,
    size: ConstraintSize,
    previous: ChartPoint | null,
    next: ChartPoint | null,
    box: ChartRect
  ): ValuePosition {
    const position = super.automaticValuePosition(point, size, previous, next, box);
    if (position === 'right' || position === 'left') return 'top';
    return position;
  }
}
