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
 *   - pdf/lib/src/widgets/chart/grid_radial.dart
 */

import type { Constraints, LayoutBox, PositionedBox, RenderContext } from '../widget.ts';
import { ChartFrame, ChartGrid, chartOf } from './chart.ts';
import type { ChartGridLayoutData, ChartPoint } from './chart.ts';

/** The placement of a `RadialGrid`. */
export class RadialFrame extends ChartFrame {
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number, originX = 0, originPdfY = 0, originTop = 0) {
    super(originX, originPdfY, originTop);
    this.width = width;
    this.height = height;
  }

  override toChart(point: ChartPoint): ChartPoint {
    const z = 3;
    return {
      x: z * point.y * Math.cos(point.x / 7 * Math.PI * 2) + this.width / 2,
      y: z * point.y * Math.sin(point.x / 7 * Math.PI * 2) + this.height / 2
    };
  }

  withOrigin(originX: number, originPdfY: number, originTop: number): RadialFrame {
    return new RadialFrame(this.width, this.height, originX, originPdfY, originTop);
  }
}

export interface RadialGridLayoutData extends ChartGridLayoutData {
  readonly frame: RadialFrame;
}

/** Polar coordinates. Upstream marks this experimental; it is ported as-is. */
export class RadialGrid extends ChartGrid<RadialGridLayoutData> {
  override layout(context: RenderContext, constraints: Constraints): LayoutBox<RadialGridLayoutData> {
    const datasets = chartOf(context).datasets;
    const size = this.gridSize(constraints);
    const frame = new RadialFrame(size.width, size.height);
    const datasetData = datasets.map(dataset => dataset.layout(context, frame));

    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: { frame, datasetData }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<RadialGridLayoutData>): void {
    const datasets = chartOf(context).datasets;
    const canvas = context.canvas;
    const bottom = box.y + box.height;
    const frame = box.data.frame.withOrigin(box.x, canvas.toPdfY(bottom), bottom);

    this.clip(context, frame, box.width, box.height);
    datasets.forEach((dataset, index) => dataset.paintBackground(context, frame, box.data.datasetData[index]));
    canvas.restoreContext();

    this.clip(context, frame, box.width, box.height);
    datasets.forEach((dataset, index) => dataset.paint(context, frame, box.data.datasetData[index]));
    canvas.restoreContext();

    datasets.forEach((dataset, index) => dataset.paintForeground(context, frame, box.data.datasetData[index]));
  }

  private clip(context: RenderContext, frame: RadialFrame, width: number, height: number): void {
    context.canvas.saveContext();
    context.canvas.drawRect(frame.px(0), frame.py(0), width, height);
    context.canvas.clipPath();
  }
}
