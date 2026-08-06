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
 *   - pdf/lib/src/widgets/chart/line_chart.dart
 */

import { normalizeColor } from '../../pdf/color.ts';
import type { ColorInput, Rgb } from '../../pdf/color.ts';
import { PdfGraphicState } from '../../pdf/graphic_state.ts';
import { Border } from '../box_border.ts';
import { Container } from '../container.ts';
import { BoxDecoration } from '../decoration.ts';
import type { AnyWidget, RenderContext } from '../widget.ts';
import { CHART_BLACK, CHART_BLUE, ChartFrame } from './chart.ts';
import type { ChartPoint } from './chart.ts';
import { CartesianFrame } from './grid_cartesian.ts';
import { PointDataSet } from './point_chart.ts';
import type { PointDataSetOptions } from './point_chart.ts';

export interface LineDataSetOptions extends PointDataSetOptions {
  readonly lineWidth?: number;
  readonly drawLine?: boolean;
  readonly lineColor?: ColorInput | null;
  readonly drawSurface?: boolean;
  readonly surfaceOpacity?: number;
  readonly surfaceColor?: ColorInput | null;
  readonly isCurved?: boolean;
  readonly smoothness?: number;
  readonly pointColor?: ColorInput | null;
}

/** A polyline — optionally smoothed, optionally filled down to the axis. */
export class LineDataSet extends PointDataSet {
  readonly lineWidth: number;
  readonly drawLine: boolean;
  readonly lineColor: Rgb | null;
  readonly drawSurface: boolean;
  readonly surfaceColor: Rgb | null;
  readonly surfaceOpacity: number;
  readonly isCurved: boolean;
  readonly smoothness: number;

  constructor({
    data,
    legend = null,
    pointColor = null,
    pointSize = 3,
    color = CHART_BLUE,
    lineWidth = 2,
    drawLine = true,
    lineColor = null,
    drawPoints = true,
    shape = null,
    buildValue = null,
    valuePosition = 'auto',
    drawSurface = false,
    surfaceOpacity = 0.2,
    surfaceColor = null,
    isCurved = false,
    smoothness = 0.35,
    borderColor = null,
    borderWidth = 1.5
  }: LineDataSetOptions) {
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
    if (!drawLine && !drawPoints && !drawSurface) {
      throw new Error('LineDataSet must draw its line, its points or its surface');
    }
    this.lineWidth = Number(lineWidth);
    this.drawLine = Boolean(drawLine);
    this.lineColor = lineColor === null ? null : normalizeColor(lineColor);
    this.drawSurface = Boolean(drawSurface);
    this.surfaceColor = surfaceColor === null ? null : normalizeColor(surfaceColor);
    this.surfaceOpacity = Number(surfaceOpacity);
    this.isCurved = Boolean(isCurved);
    this.smoothness = Number(smoothness);
  }

  override legendShape(context: RenderContext): AnyWidget {
    if (this.shape !== null) return this.shape(context);
    return new Container({
      decoration: new BoxDecoration({
        color: this.lineColor ?? this.color,
        border: Border.all({ color: this.borderColor ?? CHART_BLACK, width: this.borderWidth })
      })
    });
  }

  private drawPath(context: RenderContext, frame: ChartFrame, moveTo: boolean): void {
    if (this.data.length < 2) return;

    const canvas = context.canvas;
    let t: ChartPoint = { x: 0, y: 0 };

    const first = frame.toChart(this.data[0]!.point);
    if (moveTo) {
      canvas.moveTo(frame.px(first.x), frame.py(first.y));
    } else {
      canvas.lineTo(frame.px(first.x), frame.py(first.y));
    }

    for (let index = 1; index < this.data.length; index++) {
      const p = frame.toChart(this.data[index]!.point);

      if (!this.isCurved) {
        canvas.lineTo(frame.px(p.x), frame.py(p.y));
        continue;
      }

      const pp = frame.toChart(this.data[index - 1]!.point);
      const pn = frame.toChart(this.data[index + 1 < this.data.length ? index + 1 : index]!.point);

      const c1 = { x: pp.x + t.x, y: pp.y + t.y };
      t = {
        x: (pn.x - pp.x) / 2 * this.smoothness,
        y: (pn.y - pp.y) / 2 * this.smoothness
      };
      const c2 = { x: p.x - t.x, y: p.y - t.y };

      canvas.curveTo(
        frame.px(c1.x),
        frame.py(c1.y),
        frame.px(c2.x),
        frame.py(c2.y),
        frame.px(p.x),
        frame.py(p.y)
      );
    }
  }

  private drawArea(context: RenderContext, frame: ChartFrame): void {
    if (this.data.length < 2) return;

    const canvas = context.canvas;
    const base = frame instanceof CartesianFrame ? frame.xAxisOffset : 0;

    this.drawPath(context, frame, true);

    const last = frame.toChart(this.data[this.data.length - 1]!.point);
    canvas.lineTo(frame.px(last.x), frame.py(base));
    const first = frame.toChart(this.data[0]!.point);
    canvas.lineTo(frame.px(first.x), frame.py(base));
  }

  override paintBackground(context: RenderContext, frame: ChartFrame, _data: null): void {
    if (this.data.length === 0 || !this.drawSurface) return;

    const canvas = context.canvas;
    this.drawArea(context, frame);

    if (this.surfaceOpacity !== 1) {
      canvas.saveContext();
      canvas.setGraphicState(new PdfGraphicState({ opacity: this.surfaceOpacity }));
    }

    canvas.setFillColor(this.surfaceColor ?? this.color ?? CHART_BLUE);
    canvas.fillPath();

    if (this.surfaceOpacity !== 1) canvas.restoreContext();
  }

  override paint(context: RenderContext, frame: ChartFrame, _data: null): void {
    if (this.data.length === 0 || !this.drawLine) return;

    const canvas = context.canvas;
    this.drawPath(context, frame, true);
    canvas.setStrokeColor(this.lineColor ?? this.color ?? CHART_BLUE);
    canvas.setLineWidth(this.lineWidth);
    canvas.setLineCap('round');
    canvas.setLineJoin('round');
    canvas.strokePath();
  }
}
