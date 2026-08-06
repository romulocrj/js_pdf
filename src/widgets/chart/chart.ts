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
 *   - pdf/lib/src/widgets/chart/chart.dart
 */

import { normalizeColor } from '../../pdf/color.ts';
import type { ColorInput, Rgb } from '../../pdf/color.ts';
import { Border } from '../box_border.ts';
import { Container } from '../container.ts';
import { BoxDecoration } from '../decoration.ts';
import { Column, Expanded, Row } from '../flex.ts';
import { Alignment, BoxConstraints } from '../geometry.ts';
import type { ConstraintSize } from '../geometry.ts';
import { Stack } from '../stack.ts';
import { Widget } from '../widget.ts';
import type { AnyLayoutBox, AnyWidget, Constraints, LayoutBox, PositionedBox, RenderContext } from '../widget.ts';

/** Upstream `PdfColors.black`, which the port has no palette module for. */
export const CHART_BLACK = '#000000';

/** Upstream `PdfColors.white`. */
export const CHART_WHITE = '#ffffff';

/** Upstream `PdfColors.blue`, the default series color. */
export const CHART_BLUE = '#2196f3';

/** A point in a chart's own value space, upstream's `PdfPoint` in chart code. */
export interface ChartPoint {
  readonly x: number;
  readonly y: number;
}

/** A rectangle in a grid's local, y-up space. */
export interface ChartRect {
  readonly left: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Lay a widget out unconstrained and paint it so that `alignment` inside its
 * own box lands on (`x`, `top`) — upstream's `Widget.draw`.
 *
 * Alignment constants are y-up (see `geometry.ts`), the widget layer is y-down,
 * hence the sign flip on the vertical term.
 */
export function drawWidget(
  context: RenderContext,
  widget: AnyWidget,
  x: number,
  top: number,
  alignment: Alignment | null = null,
  constraints: Constraints = new BoxConstraints()
): void {
  const box = widget.layout(context, constraints);
  const dx = alignment === null ? 0 : (1 + alignment.x) * box.width / 2;
  const dy = alignment === null ? 0 : (1 - alignment.y) * box.height / 2;
  widget.paint(context, { ...box, x: x - dx, y: top - dy });
}

/**
 * Where a grid sits on the page, and how its own coordinates map onto it.
 *
 * Upstream charts draw in the y-up space left behind by a canvas translation to
 * the grid's origin. This port keeps that space — every coordinate a grid, axis
 * or data set computes is local and y-up, exactly as in the Dart sources — and
 * converts only when a command reaches the canvas: `px`/`py` produce PDF-space
 * arguments for path operators, `top` produces the y-down value the widget
 * layer places boxes with.
 */
export abstract class ChartFrame {
  readonly originX: number;
  readonly originPdfY: number;
  readonly originTop: number;

  constructor(originX: number, originPdfY: number, originTop: number) {
    this.originX = originX;
    this.originPdfY = originPdfY;
    this.originTop = originTop;
  }

  px(x: number): number {
    return this.originX + x;
  }

  py(y: number): number {
    return this.originPdfY + y;
  }

  top(y: number): number {
    return this.originTop - y;
  }

  abstract toChart(point: ChartPoint): ChartPoint;
}

/** The value a `Chart` scopes for its subtree, upstream's `Chart.of(context)`. */
export interface ChartScope {
  readonly grid: AnyChartGrid;
  readonly datasets: readonly AnyDataset[];
}

/**
 * Upstream registers the chart as an `Inherited` and children look it up. The
 * port threads inherited values through the context instead (see `widget.ts`),
 * so `Chart` hands its subtree a context carrying this field.
 */
interface ChartRenderContext extends RenderContext {
  readonly chart?: ChartScope | null;
}

/** Upstream `Chart.of(context)`. */
export function chartOf(context: RenderContext): ChartScope {
  const scope = (context as ChartRenderContext).chart;
  if (scope === undefined || scope === null) {
    throw new Error('This widget must be placed inside a Chart');
  }
  return scope;
}

export interface DatasetOptions {
  readonly legend?: string | null;
  readonly color?: ColorInput | null;
  readonly borderColor?: ColorInput | null;
  readonly borderWidth?: number;
}

/**
 * One series of a chart.
 *
 * Upstream a data set is a `Widget` whose `layout` stores a box on itself. The
 * port's layout protocol forbids that, so a data set is laid out by its grid
 * and returns the value it needs at paint time, which the grid carries in its
 * own layout data.
 */
export abstract class Dataset<TData = unknown> {
  readonly legend: string | null;
  readonly color: Rgb | null;
  readonly borderColor: Rgb | null;
  readonly borderWidth: number;

  constructor({ legend = null, color = null, borderColor = null, borderWidth = 0.5 }: DatasetOptions = {}) {
    this.legend = legend === null || legend === undefined ? null : String(legend);
    this.color = color === null || color === undefined ? null : normalizeColor(color);
    this.borderColor = borderColor === null || borderColor === undefined ? null : normalizeColor(borderColor);
    this.borderWidth = Number(borderWidth);
  }

  abstract layout(context: RenderContext, frame: ChartFrame): TData;

  paintBackground(_context: RenderContext, _frame: ChartFrame, _data: TData): void {}

  paint(_context: RenderContext, _frame: ChartFrame, _data: TData): void {}

  paintForeground(_context: RenderContext, _frame: ChartFrame, _data: TData): void {}

  legendShape(_context: RenderContext): AnyWidget {
    return new Container({
      decoration: new BoxDecoration({
        color: this.color,
        border: Border.all({ color: this.borderColor ?? CHART_BLACK, width: this.borderWidth })
      })
    });
  }
}

/** A data set of unspecified layout-data type, for heterogeneous series lists. */
export type AnyDataset = Dataset<unknown>;

export interface ChartGridLayoutData {
  readonly datasetData: readonly unknown[];
}

/**
 * Base of the coordinate systems a chart can draw in.
 *
 * Upstream `ChartGrid.layout` takes `constraints.biggest`; so does every
 * subclass here, through `gridSize`.
 */
export abstract class ChartGrid<TData extends ChartGridLayoutData = ChartGridLayoutData> extends Widget<TData> {
  protected gridSize(constraints: Constraints): ConstraintSize {
    return BoxConstraints.from(constraints).biggest;
  }
}

export type AnyChartGrid = ChartGrid<ChartGridLayoutData>;

export interface ChartOptions {
  readonly grid: AnyChartGrid;
  readonly datasets: readonly AnyDataset[];
  readonly overlay?: AnyWidget | null;
  readonly title?: AnyWidget | null;
  readonly bottom?: AnyWidget | null;
  readonly left?: AnyWidget | null;
  readonly right?: AnyWidget | null;
}

export interface ChartLayoutData {
  readonly childBox: AnyLayoutBox;
}

/**
 * A grid, its data sets, and the widgets arranged around them.
 *
 * The layout is upstream's: a `Column` of title, body and bottom, where the
 * body is a `Row` of left, the grid stacked with the overlay, and right.
 */
export class Chart extends Widget<ChartLayoutData> {
  readonly grid: AnyChartGrid;
  readonly datasets: readonly AnyDataset[];
  readonly overlay: AnyWidget | null;
  readonly title: AnyWidget | null;
  readonly bottom: AnyWidget | null;
  readonly left: AnyWidget | null;
  readonly right: AnyWidget | null;

  /** The chart in force at `context`. */
  static of(context: RenderContext): ChartScope {
    return chartOf(context);
  }

  constructor({
    grid,
    datasets,
    overlay = null,
    title = null,
    bottom = null,
    left = null,
    right = null
  }: ChartOptions) {
    super();
    this.grid = grid;
    this.datasets = [...datasets];
    this.overlay = overlay;
    this.title = title;
    this.bottom = bottom;
    this.left = left;
    this.right = right;
  }

  /** Upstream `_computeSize`: square when an axis is unbounded. */
  private computeSize(constraints: Constraints): ConstraintSize {
    const parent = BoxConstraints.from(constraints);
    if (parent.isTight) return parent.smallest;

    const aspectRatio = 1;
    let width = parent.maxWidth;
    let height = parent.maxHeight;

    if (!Number.isFinite(width)) width = height * aspectRatio;
    if (!Number.isFinite(height)) height = width * aspectRatio;

    return parent.constrain({ width, height });
  }

  private scope(context: RenderContext): RenderContext {
    const scoped: ChartRenderContext = {
      ...context,
      chart: { grid: this.grid, datasets: this.datasets }
    };
    return scoped;
  }

  private build(): AnyWidget {
    const stack = new Stack({
      overflow: 'visible',
      children: this.overlay === null ? [this.grid] : [this.grid, this.overlay]
    });

    const row: AnyWidget[] = [];
    if (this.left !== null) row.push(this.left);
    row.push(new Expanded({ child: stack }));
    if (this.right !== null) row.push(this.right);

    const column: AnyWidget[] = [];
    if (this.title !== null) column.push(this.title);
    column.push(new Expanded({ child: new Row({ children: row }) }));
    if (this.bottom !== null) column.push(this.bottom);

    return new Column({ children: column });
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<ChartLayoutData> {
    const size = this.computeSize(constraints);
    const childBox = this.build().layout(this.scope(context), BoxConstraints.tight(size));

    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: { childBox }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<ChartLayoutData>): void {
    const { childBox } = box.data;
    childBox.widget.paint(this.scope(context), { ...childBox, x: box.x, y: box.y });
  }
}
