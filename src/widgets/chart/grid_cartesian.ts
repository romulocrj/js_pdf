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
 *   - pdf/lib/src/widgets/chart/grid_cartesian.dart
 */

import type { Constraints, LayoutBox, PositionedBox, RenderContext } from '../widget.ts';
import { ChartFrame, ChartGrid, chartOf } from './chart.ts';
import type { ChartGridLayoutData, ChartPoint, ChartRect } from './chart.ts';
import type { AxisLayout, AxisPositions, GridAxis } from './grid_axis.ts';

/** The placement and value mapping of a `CartesianGrid`. */
export class CartesianFrame extends ChartFrame {
  readonly xAxis: GridAxis;
  readonly yAxis: GridAxis;
  readonly xLayout: AxisLayout;
  readonly yLayout: AxisLayout;
  readonly gridBox: ChartRect;

  constructor(
    xAxis: GridAxis,
    yAxis: GridAxis,
    xLayout: AxisLayout,
    yLayout: AxisLayout,
    gridBox: ChartRect,
    originX = 0,
    originPdfY = 0,
    originTop = 0
  ) {
    super(originX, originPdfY, originTop);
    this.xAxis = xAxis;
    this.yAxis = yAxis;
    this.xLayout = xLayout;
    this.yLayout = yLayout;
    this.gridBox = gridBox;
  }

  get xAxisOffset(): number {
    return this.xLayout.axisPosition;
  }

  get yAxisOffset(): number {
    return this.yLayout.axisPosition;
  }

  override toChart(point: ChartPoint): ChartPoint {
    return {
      x: this.xAxis.toChart(point.x, this.xLayout),
      y: this.yAxis.toChart(point.y, this.yLayout)
    };
  }

  withOrigin(originX: number, originPdfY: number, originTop: number): CartesianFrame {
    return new CartesianFrame(
      this.xAxis,
      this.yAxis,
      this.xLayout,
      this.yLayout,
      this.gridBox,
      originX,
      originPdfY,
      originTop
    );
  }
}

export interface CartesianGridOptions {
  readonly xAxis: GridAxis;
  readonly yAxis: GridAxis;
}

export interface CartesianGridLayoutData extends ChartGridLayoutData {
  readonly frame: CartesianFrame;
  readonly width: number;
  readonly height: number;
}

/** Two perpendicular axes and everything drawn between them. */
export class CartesianGrid extends ChartGrid<CartesianGridLayoutData> {
  readonly xAxis: GridAxis;
  readonly yAxis: GridAxis;

  constructor({ xAxis, yAxis }: CartesianGridOptions) {
    super();
    this.xAxis = xAxis;
    this.yAxis = yAxis;
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<CartesianGridLayoutData> {
    const datasets = chartOf(context).datasets;
    const size = this.gridSize(constraints);

    /*
     * Upstream's convergence loop, with the axis state held in locals: each
     * axis' cross position is the other's axis position, so the label gutters
     * settle after — in simple cases — two passes.
     */
    let x: AxisPositions = { axisPosition: 0, crossAxisPosition: 0, marginEnd: this.xAxis.marginEnd };
    let y: AxisPositions = { axisPosition: 0, crossAxisPosition: 0, marginEnd: this.yAxis.marginEnd };
    let xLayout = this.xAxis.layout(context, 'horizontal', size, x);
    let yLayout = this.yAxis.layout(context, 'vertical', size, y);

    let count = 5;
    while (count-- > 0) {
      x = {
        axisPosition: Math.max(x.axisPosition, y.crossAxisPosition),
        crossAxisPosition: y.axisPosition,
        marginEnd: x.marginEnd
      };
      xLayout = this.xAxis.layout(context, 'horizontal', size, x);
      x = {
        axisPosition: xLayout.axisPosition,
        crossAxisPosition: xLayout.crossAxisPosition,
        marginEnd: xLayout.marginEnd
      };

      y = {
        axisPosition: Math.max(y.axisPosition, x.crossAxisPosition),
        crossAxisPosition: x.axisPosition,
        marginEnd: y.marginEnd
      };
      yLayout = this.yAxis.layout(context, 'vertical', size, y);
      y = {
        axisPosition: yLayout.axisPosition,
        crossAxisPosition: yLayout.crossAxisPosition,
        marginEnd: yLayout.marginEnd
      };

      if (y.crossAxisPosition === x.axisPosition && x.crossAxisPosition === y.axisPosition) break;
    }

    const left = yLayout.axisPosition;
    const bottom = xLayout.axisPosition;
    const gridBox: ChartRect = {
      left,
      bottom,
      width: size.width - left,
      height: size.height - bottom
    };

    const frame = new CartesianFrame(this.xAxis, this.yAxis, xLayout, yLayout, gridBox);
    const datasetData = datasets.map(dataset => dataset.layout(context, frame));

    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: { frame, datasetData, width: size.width, height: size.height }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<CartesianGridLayoutData>): void {
    const datasets = chartOf(context).datasets;
    const canvas = context.canvas;
    const bottom = box.y + box.height;
    const frame = box.data.frame.withOrigin(box.x, canvas.toPdfY(bottom), bottom);

    this.clip(context, frame);
    datasets.forEach((dataset, index) => dataset.paintBackground(context, frame, box.data.datasetData[index]));
    canvas.restoreContext();

    this.xAxis.paintBackground(context, frame, frame.xLayout);
    this.yAxis.paintBackground(context, frame, frame.yLayout);

    this.clip(context, frame);
    datasets.forEach((dataset, index) => dataset.paint(context, frame, box.data.datasetData[index]));
    canvas.restoreContext();

    // The axes go on last, so a bar or a surface never covers its own axis.
    this.xAxis.paint(context, frame, frame.xLayout);
    this.yAxis.paint(context, frame, frame.yLayout);

    datasets.forEach((dataset, index) => dataset.paintForeground(context, frame, box.data.datasetData[index]));
  }

  private clip(context: RenderContext, frame: CartesianFrame): void {
    const grid = frame.gridBox;
    context.canvas.saveContext();
    context.canvas.drawRect(frame.px(grid.left), frame.py(grid.bottom), grid.width, grid.height);
    context.canvas.clipPath();
  }
}
