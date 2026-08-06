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
 *   - pdf/lib/src/widgets/chart/point_chart.dart
 */

import { assertFiniteNumber } from '../../base/assert.ts';
import { SizedBox } from '../basic.ts';
import { Alignment, BoxConstraints } from '../geometry.ts';
import type { ConstraintSize } from '../geometry.ts';
import type { AnyWidget, RenderContext } from '../widget.ts';
import { CHART_BLUE, ChartFrame, Dataset, drawWidget } from './chart.ts';
import type { ChartPoint, ChartRect, DatasetOptions } from './chart.ts';
import { CartesianFrame } from './grid_cartesian.ts';

export type ValuePosition = 'left' | 'top' | 'right' | 'bottom' | 'auto';

/** One (x, y) sample of a cartesian data set. */
export class PointChartValue {
  readonly x: number;
  readonly y: number;

  constructor(x: number, y: number) {
    this.x = assertFiniteNumber(Number(x), 'x');
    this.y = assertFiniteNumber(Number(y), 'y');
  }

  get point(): ChartPoint {
    return { x: this.x, y: this.y };
  }
}

export type PointShapeBuilder = (context: RenderContext) => AnyWidget;
export type PointValueBuilder = (context: RenderContext, value: PointChartValue) => AnyWidget;

export interface PointDataSetOptions extends DatasetOptions {
  readonly data: readonly PointChartValue[];
  readonly pointSize?: number;
  readonly drawPoints?: boolean;
  readonly shape?: PointShapeBuilder | null;
  readonly buildValue?: PointValueBuilder | null;
  readonly valuePosition?: ValuePosition;
}

/** Points plotted against a grid; base of the bar and line data sets. */
export class PointDataSet extends Dataset<null> {
  readonly data: readonly PointChartValue[];
  readonly drawPoints: boolean;
  readonly pointSize: number;
  readonly shape: PointShapeBuilder | null;
  readonly buildValue: PointValueBuilder | null;
  readonly valuePosition: ValuePosition;

  constructor({
    data,
    pointSize = 3,
    drawPoints = true,
    shape = null,
    buildValue = null,
    valuePosition = 'auto',
    color = CHART_BLUE,
    borderColor = null,
    borderWidth = 1.5,
    legend = null
  }: PointDataSetOptions) {
    super({ legend, color, borderColor, borderWidth });
    this.data = [...data];
    this.pointSize = Number(pointSize);
    this.drawPoints = Boolean(drawPoints);
    this.shape = shape;
    this.buildValue = buildValue;
    this.valuePosition = valuePosition;
  }

  get delta(): number {
    return this.pointSize * 0.5;
  }

  override layout(_context: RenderContext, _frame: ChartFrame): null {
    // Upstream stores the grid box on the data set; the frame already carries it.
    return null;
  }

  automaticValuePosition(
    point: ChartPoint,
    size: ConstraintSize,
    _previous: ChartPoint | null,
    _next: ChartPoint | null,
    box: ChartRect
  ): ValuePosition {
    // Usually on top, except on the edges
    if (point.x - size.width / 2 < box.left) return 'right';
    if (point.x + size.width / 2 > box.left + box.width) return 'left';
    if (point.y + size.height + this.delta > box.bottom + box.height) return 'bottom';
    return 'top';
  }

  override paintForeground(context: RenderContext, frame: ChartFrame, _data: null): void {
    if (this.data.length === 0) return;

    const canvas = context.canvas;

    if (this.drawPoints) {
      if (this.shape === null) {
        for (const value of this.data) {
          const p = frame.toChart(value.point);
          canvas.drawEllipse(frame.px(p.x), frame.py(p.y), this.pointSize, this.pointSize);
        }
        canvas.setColor(this.color ?? CHART_BLUE);
        canvas.fillPath();
      } else {
        for (const value of this.data) {
          const p = frame.toChart(value.point);
          drawWidget(
            context,
            new SizedBox({ width: this.pointSize * 2, height: this.pointSize * 2, child: this.shape(context) }),
            frame.px(p.x),
            frame.top(p.y),
            Alignment.center
          );
        }
      }
    }

    if (this.buildValue === null) return;

    const box = frame instanceof CartesianFrame
      ? frame.gridBox
      : { left: 0, bottom: 0, width: 0, height: 0 };
    let previous: ChartPoint | null = null;
    let index = 1;

    for (const value of this.data) {
      const p = frame.toChart(value.point);
      const measured = this.buildValue(context, value).layout(context, new BoxConstraints());
      const size = { width: measured.width, height: measured.height };

      let position = this.valuePosition;
      if (position === 'auto') {
        const next = index < this.data.length ? frame.toChart(this.data[index++]!.point) : null;
        position = this.automaticValuePosition(p, size, previous, next, box);
      }

      let offset: ChartPoint;
      switch (position) {
        case 'left':
          offset = { x: p.x - size.width / 2 - this.pointSize - this.delta, y: p.y };
          break;
        case 'top':
          offset = { x: p.x, y: p.y + size.height / 2 + this.pointSize + this.delta };
          break;
        case 'right':
          offset = { x: p.x + size.width / 2 + this.pointSize + this.delta, y: p.y };
          break;
        case 'bottom':
          offset = { x: p.x, y: p.y - size.height / 2 - this.pointSize - this.delta };
          break;
        default:
          offset = p;
          break;
      }

      drawWidget(context, this.buildValue(context, value), frame.px(offset.x), frame.top(offset.y), Alignment.center);
      previous = p;
    }
  }

  override legendShape(context: RenderContext): AnyWidget {
    return this.shape === null ? super.legendShape(context) : this.shape(context);
  }
}
