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
 *   - pdf/lib/src/widgets/chart/pie_chart.dart
 *
 * PORT GAP: `legendWidget` is built by the data set instead of being accepted
 * from the caller, and `debugPaint` is not ported.
 */

import { isLightColor, normalizeColor } from '../../pdf/color.ts';
import type { ColorInput, Rgb } from '../../pdf/color.ts';
import { PdfGraphicState } from '../../pdf/graphic_state.ts';
import { BoxConstraints } from '../geometry.ts';
import { RichText, TextSpan } from '../text.ts';
import type { TextAlign } from '../text.ts';
import { TextStyle } from '../text_style.ts';
import type { AnyLayoutBox, AnyWidget, Constraints, LayoutBox, PositionedBox, RenderContext } from '../widget.ts';
import { CHART_BLACK, CHART_BLUE, CHART_WHITE, ChartFrame, ChartGrid, chartOf, Dataset } from './chart.ts';
import type { ChartGridLayoutData, ChartPoint, DatasetOptions } from './chart.ts';

/** The placement of one slice inside a `PieGrid`. */
export class PieFrame extends ChartFrame {
  readonly radius: number;
  readonly angleStart: number;
  readonly angleEnd: number;

  constructor(
    radius: number,
    angleStart: number,
    angleEnd: number,
    originX = 0,
    originPdfY = 0,
    originTop = 0
  ) {
    super(originX, originPdfY, originTop);
    this.radius = radius;
    this.angleStart = angleStart;
    this.angleEnd = angleEnd;
  }

  override toChart(point: ChartPoint): ChartPoint {
    return point;
  }

  withOrigin(originX: number, originPdfY: number, originTop: number): PieFrame {
    return new PieFrame(this.radius, this.angleStart, this.angleEnd, originX, originPdfY, originTop);
  }
}

export type PieLegendPosition = 'none' | 'auto' | 'inside' | 'outside';

export interface PieDataSetOptions extends DatasetOptions {
  readonly value: number;
  readonly drawBorder?: boolean | null;
  readonly drawSurface?: boolean;
  readonly surfaceOpacity?: number;
  readonly offset?: number;
  readonly legendStyle?: TextStyle | null;
  readonly legendAlign?: TextAlign | null;
  readonly legendPosition?: PieLegendPosition;
  readonly legendLineWidth?: number;
  readonly legendLineColor?: ColorInput | null;
  readonly legendOffset?: number;
  readonly innerRadius?: number;
}

/** What laying one pie slice out produced. */
export interface PieSliceLayout {
  readonly legend: AnyWidget | null;
  readonly legendBox: AnyLayoutBox | null;
  readonly legendLeft: number;
  readonly legendBottom: number;
  readonly anchor: ChartPoint | null;
  readonly pivot: ChartPoint | null;
  readonly start: ChartPoint | null;
  readonly boxWidth: number;
  readonly boxHeight: number;
}

/** One slice of a pie, with its own legend placement. */
export class PieDataSet extends Dataset<PieSliceLayout> {
  readonly value: number;
  readonly drawBorder: boolean;
  readonly drawSurface: boolean;
  readonly surfaceOpacity: number;
  readonly offset: number;
  readonly legendStyle: TextStyle | null;
  readonly legendAlign: TextAlign | null;
  readonly legendPosition: PieLegendPosition;
  readonly legendLineWidth: number;
  readonly legendLineColor: Rgb;
  readonly legendOffset: number;
  readonly innerRadius: number;

  constructor({
    value,
    legend = null,
    color,
    borderColor = CHART_WHITE,
    borderWidth = 1.5,
    drawBorder = null,
    drawSurface = true,
    surfaceOpacity = 1,
    offset = 0,
    legendStyle = null,
    legendAlign = null,
    legendPosition = 'auto',
    legendLineWidth = 1,
    legendLineColor = null,
    legendOffset = 20,
    innerRadius = 0
  }: PieDataSetOptions) {
    super({ legend, color: color ?? CHART_BLUE, borderColor, borderWidth });
    if (innerRadius < 0) throw new RangeError('PieDataSet innerRadius must not be negative');
    if (offset < 0) throw new RangeError('PieDataSet offset must not be negative');

    this.value = Number(value);
    const fill = this.color ?? normalizeColor(CHART_BLUE);
    const border = this.borderColor;
    this.drawBorder = drawBorder ?? (
      border !== null && (border[0] !== fill[0] || border[1] !== fill[1] || border[2] !== fill[2])
    );
    if (!this.drawBorder && !drawSurface) {
      throw new Error('PieDataSet must draw its surface or its border');
    }
    this.drawSurface = Boolean(drawSurface);
    this.surfaceOpacity = Number(surfaceOpacity);
    this.offset = Number(offset);
    this.legendStyle = legendStyle;
    this.legendAlign = legendAlign;
    this.legendPosition = legendPosition;
    this.legendLineWidth = Number(legendLineWidth);
    this.legendLineColor = legendLineColor === null ? fill : normalizeColor(legendLineColor);
    this.legendOffset = Number(legendOffset);
    this.innerRadius = Number(innerRadius);
  }

  private isFullCircle(frame: PieFrame): boolean {
    return frame.angleEnd - frame.angleStart >= Math.PI * 2;
  }

  override layout(context: RenderContext, frame: ChartFrame): PieSliceLayout {
    if (!(frame instanceof PieFrame)) {
      throw new Error('Use only PieDataSet with a PieGrid');
    }

    const fullCircle = this.isFullCircle(frame);
    const offset = fullCircle ? 0 : this.offset;
    const len = frame.radius + offset;
    // Upstream also tracks the box origin (-w/2, -h/2); only the extent is read
    // back, by the grid's radius-reduction loop.
    let w = len * 2;
    let h = len * 2;

    const position = this.legendPosition === 'auto'
      ? (frame.angleEnd - frame.angleStart > Math.PI / 6 ? 'inside' : 'outside')
      : this.legendPosition;

    const bisect = fullCircle ? Math.PI / 4 : (frame.angleStart + frame.angleEnd) / 2;

    const align = this.legendAlign
      ?? (position === 'inside' ? 'center' : (bisect > Math.PI ? 'right' : 'left'));

    const legend = this.legend === null
      ? null
      : new RichText({
        text: new TextSpan({
          children: [new TextSpan({ text: this.legend, style: this.legendStyle ?? undefined })],
          style: new TextStyle({
            color: position === 'inside'
              ? (isLightColor(this.color ?? CHART_BLUE) ? normalizeColor(CHART_WHITE) : normalizeColor(CHART_BLACK))
              : null
          })
        }),
        textAlign: align
      });

    let legendBox: AnyLayoutBox | null = null;
    let legendLeft = 0;
    let legendBottom = 0;
    let anchor: ChartPoint | null = null;
    let pivot: ChartPoint | null = null;
    let start: ChartPoint | null = null;

    if (legend !== null) {
      legendBox = legend.layout(context, new BoxConstraints({
        maxWidth: frame.radius,
        maxHeight: frame.radius
      }));
      const ls = { width: legendBox.width, height: legendBox.height };

      if (position === 'outside') {
        const o = frame.radius + this.legendOffset;
        const cx = Math.sin(bisect) * (offset + o);
        const cy = Math.cos(bisect) * (offset + o);

        start = {
          x: Math.sin(bisect) * (offset + frame.radius + this.legendOffset * 0.1),
          y: Math.cos(bisect) * (offset + frame.radius + this.legendOffset * 0.1)
        };
        pivot = { x: cx, y: cy };

        if (bisect > Math.PI) {
          anchor = { x: cx - this.legendOffset / 2 * 0.8, y: cy };
          legendLeft = cx - this.legendOffset / 2 - ls.width;
          legendBottom = cy - ls.height / 2;
          w = Math.max(w, (-cx + this.legendOffset / 2 + ls.width) * 2);
          h = Math.max(h, Math.abs(cy) * 2 + ls.height);
        } else {
          anchor = { x: cx + this.legendOffset / 2 * 0.8, y: cy };
          legendLeft = cx + this.legendOffset / 2;
          legendBottom = cy - ls.height / 2;
          w = Math.max(w, (cx + this.legendOffset / 2 + ls.width) * 2);
          h = Math.max(h, Math.abs(cy) * 2 + ls.height);
        }
      } else if (position === 'inside') {
        let o: number;
        let cx: number;
        let cy: number;
        if (this.innerRadius === 0) {
          o = fullCircle ? 0 : frame.radius * 2 / 3;
          cx = Math.sin(bisect) * (offset + o);
          cy = Math.cos(bisect) * (offset + o);
        } else {
          o = (frame.radius + this.innerRadius) / 2;
          if (fullCircle) {
            cx = 0;
            cy = o;
          } else {
            cx = Math.sin(bisect) * (offset + o);
            cy = Math.cos(bisect) * (offset + o);
          }
        }
        legendLeft = cx - ls.width / 2;
        legendBottom = cy - ls.height / 2;
      }
    }

    return {
      legend,
      legendBox,
      legendLeft,
      legendBottom,
      anchor,
      pivot,
      start,
      boxWidth: w,
      boxHeight: h
    };
  }

  private appendSlice(context: RenderContext, frame: PieFrame): void {
    const canvas = context.canvas;
    const bisect = (frame.angleStart + frame.angleEnd) / 2;
    const cx = Math.sin(bisect) * this.offset;
    const cy = Math.cos(bisect) * this.offset;

    const sx = cx + Math.sin(frame.angleStart) * frame.radius;
    const sy = cy + Math.cos(frame.angleStart) * frame.radius;
    const ex = cx + Math.sin(frame.angleEnd) * frame.radius;
    const ey = cy + Math.cos(frame.angleEnd) * frame.radius;

    if (this.isFullCircle(frame)) {
      canvas.drawEllipse(frame.px(0), frame.py(0), frame.radius, frame.radius);
      return;
    }

    canvas.moveTo(frame.px(cx), frame.py(cy));
    canvas.lineTo(frame.px(sx), frame.py(sy));
    canvas.bezierArc(
      frame.px(sx),
      frame.py(sy),
      frame.radius,
      frame.radius,
      frame.px(ex),
      frame.py(ey),
      { large: frame.angleEnd - frame.angleStart > Math.PI }
    );
  }

  private appendDonut(context: RenderContext, frame: PieFrame): void {
    const canvas = context.canvas;
    const bisect = (frame.angleStart + frame.angleEnd) / 2;
    const cx = Math.sin(bisect) * this.offset;
    const cy = Math.cos(bisect) * this.offset;

    const stx = cx + Math.sin(frame.angleStart) * frame.radius;
    const sty = cy + Math.cos(frame.angleStart) * frame.radius;
    const etx = cx + Math.sin(frame.angleEnd) * frame.radius;
    const ety = cy + Math.cos(frame.angleEnd) * frame.radius;
    const sbx = cx + Math.sin(frame.angleStart) * this.innerRadius;
    const sby = cy + Math.cos(frame.angleStart) * this.innerRadius;
    const ebx = cx + Math.sin(frame.angleEnd) * this.innerRadius;
    const eby = cy + Math.cos(frame.angleEnd) * this.innerRadius;

    if (this.isFullCircle(frame)) {
      canvas.drawEllipse(frame.px(0), frame.py(0), frame.radius, frame.radius);
      canvas.drawEllipse(frame.px(0), frame.py(0), this.innerRadius, this.innerRadius, false);
      return;
    }

    const large = frame.angleEnd - frame.angleStart > Math.PI;
    canvas.moveTo(frame.px(stx), frame.py(sty));
    canvas.bezierArc(
      frame.px(stx),
      frame.py(sty),
      frame.radius,
      frame.radius,
      frame.px(etx),
      frame.py(ety),
      { large }
    );
    canvas.lineTo(frame.px(ebx), frame.py(eby));
    canvas.bezierArc(
      frame.px(ebx),
      frame.py(eby),
      this.innerRadius,
      this.innerRadius,
      frame.px(sbx),
      frame.py(sby),
      { large, sweep: true }
    );
    canvas.lineTo(frame.px(stx), frame.py(sty));
  }

  private appendShape(context: RenderContext, frame: PieFrame): void {
    if (this.innerRadius === 0) {
      this.appendSlice(context, frame);
    } else {
      this.appendDonut(context, frame);
    }
  }

  override paintBackground(context: RenderContext, frame: ChartFrame, _data: PieSliceLayout): void {
    if (!(frame instanceof PieFrame) || !this.drawSurface) return;

    const canvas = context.canvas;
    this.appendShape(context, frame);

    if (this.surfaceOpacity !== 1) {
      canvas.saveContext();
      canvas.setGraphicState(new PdfGraphicState({ opacity: this.surfaceOpacity }));
    }

    canvas.setFillColor(this.color ?? CHART_BLUE);
    canvas.fillPath();

    if (this.surfaceOpacity !== 1) canvas.restoreContext();
  }

  override paint(context: RenderContext, frame: ChartFrame, _data: PieSliceLayout): void {
    if (!(frame instanceof PieFrame) || !this.drawBorder) return;

    const canvas = context.canvas;
    this.appendShape(context, frame);
    canvas.setLineWidth(this.borderWidth);
    canvas.setLineJoin('round');
    canvas.setStrokeColor(this.borderColor ?? this.color ?? CHART_BLUE);
    canvas.strokePath({ close: true });
  }

  /** Upstream's protected `paintLegend`, called by `PieGrid` after the slices. */
  paintLegend(context: RenderContext, frame: ChartFrame, data: PieSliceLayout): void {
    if (this.legendPosition === 'none' || data.legend === null || data.legendBox === null) return;

    const canvas = context.canvas;

    if (data.anchor !== null && data.pivot !== null && data.start !== null) {
      canvas.saveContext();
      canvas.moveTo(frame.px(data.start.x), frame.py(data.start.y));
      canvas.lineTo(frame.px(data.pivot.x), frame.py(data.pivot.y));
      canvas.lineTo(frame.px(data.anchor.x), frame.py(data.anchor.y));
      canvas.setLineWidth(this.legendLineWidth);
      canvas.setLineCap('round');
      canvas.setLineJoin('round');
      canvas.setStrokeColor(this.legendLineColor);
      canvas.strokePath();
      canvas.restoreContext();
    }

    data.legend.paint(context, {
      ...data.legendBox,
      x: frame.px(data.legendLeft),
      y: frame.top(data.legendBottom + data.legendBox.height)
    });
  }
}

export interface PieGridOptions {
  readonly startAngle?: number;
}

export interface PieGridLayoutData extends ChartGridLayoutData {
  readonly radius: number;
  readonly angles: readonly { readonly start: number; readonly end: number }[];
}

/** Slices laid out around a common centre. */
export class PieGrid extends ChartGrid<PieGridLayoutData> {
  readonly startAngle: number;

  constructor({ startAngle = 0 }: PieGridOptions = {}) {
    super();
    this.startAngle = Number(startAngle);
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<PieGridLayoutData> {
    const datasets = chartOf(context).datasets;
    const size = this.gridSize(constraints);

    let total = 0;
    for (const dataset of datasets) {
      if (!(dataset instanceof PieDataSet)) throw new Error('Use only PieDataSet with a PieGrid');
      total += dataset.value;
    }

    const unit = total === 0 ? 0 : Math.PI / total * 2;
    let angle = this.startAngle;
    const angles = datasets.map(dataset => {
      const start = angle;
      angle += (dataset as PieDataSet).value * unit;
      return { start, end: angle };
    });

    let radius = Math.min(size.width / 2, size.height / 2);
    let datasetData: unknown[] = [];
    let reduce = false;

    do {
      reduce = false;
      datasetData = [];
      for (let index = 0; index < datasets.length; index++) {
        const slice = angles[index]!;
        const frame = new PieFrame(radius, slice.start, slice.end);
        const data = datasets[index]!.layout(context, frame) as PieSliceLayout;
        datasetData.push(data);
        if (radius > 20 && (data.boxWidth > size.width || data.boxHeight > size.height)) {
          radius -= 10;
          reduce = true;
          break;
        }
      }
    } while (reduce);

    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: { radius, angles, datasetData }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<PieGridLayoutData>): void {
    const datasets = chartOf(context).datasets;
    const canvas = context.canvas;
    const centreTop = box.y + box.height / 2;
    const originX = box.x + box.width / 2;
    const originPdfY = canvas.toPdfY(centreTop);

    const frames = box.data.angles.map(slice =>
      new PieFrame(box.data.radius, slice.start, slice.end, originX, originPdfY, centreTop));

    datasets.forEach((dataset, index) =>
      dataset.paintBackground(context, frames[index]!, box.data.datasetData[index]));
    datasets.forEach((dataset, index) =>
      dataset.paint(context, frames[index]!, box.data.datasetData[index]));
    datasets.forEach((dataset, index) => {
      if (dataset instanceof PieDataSet) {
        dataset.paintLegend(context, frames[index]!, box.data.datasetData[index] as PieSliceLayout);
      }
    });
  }
}
