import type { ColorInput, Rgb } from '../../pdf/color.ts';
import { Alignment } from '../geometry.ts';
import type { ConstraintSize } from '../geometry.ts';
import { Widget } from '../widget.ts';
import type { AnyLayoutBox, AnyWidget, Constraints, LayoutBox, PositionedBox, RenderContext } from '../widget.ts';
/** Upstream `PdfColors.black`, which the port has no palette module for. */
export declare const CHART_BLACK = "#000000";
/** Upstream `PdfColors.white`. */
export declare const CHART_WHITE = "#ffffff";
/** Upstream `PdfColors.blue`, the default series color. */
export declare const CHART_BLUE = "#2196f3";
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
export declare function drawWidget(context: RenderContext, widget: AnyWidget, x: number, top: number, alignment?: Alignment | null, constraints?: Constraints): void;
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
export declare abstract class ChartFrame {
    readonly originX: number;
    readonly originPdfY: number;
    readonly originTop: number;
    constructor(originX: number, originPdfY: number, originTop: number);
    px(x: number): number;
    py(y: number): number;
    top(y: number): number;
    abstract toChart(point: ChartPoint): ChartPoint;
}
/** The value a `Chart` scopes for its subtree, upstream's `Chart.of(context)`. */
export interface ChartScope {
    readonly grid: AnyChartGrid;
    readonly datasets: readonly AnyDataset[];
}
/** Upstream `Chart.of(context)`. */
export declare function chartOf(context: RenderContext): ChartScope;
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
export declare abstract class Dataset<TData = unknown> {
    readonly legend: string | null;
    readonly color: Rgb | null;
    readonly borderColor: Rgb | null;
    readonly borderWidth: number;
    constructor({ legend, color, borderColor, borderWidth }?: DatasetOptions);
    abstract layout(context: RenderContext, frame: ChartFrame): TData;
    paintBackground(_context: RenderContext, _frame: ChartFrame, _data: TData): void;
    paint(_context: RenderContext, _frame: ChartFrame, _data: TData): void;
    paintForeground(_context: RenderContext, _frame: ChartFrame, _data: TData): void;
    legendShape(_context: RenderContext): AnyWidget;
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
export declare abstract class ChartGrid<TData extends ChartGridLayoutData = ChartGridLayoutData> extends Widget<TData> {
    protected gridSize(constraints: Constraints): ConstraintSize;
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
export declare class Chart extends Widget<ChartLayoutData> {
    readonly grid: AnyChartGrid;
    readonly datasets: readonly AnyDataset[];
    readonly overlay: AnyWidget | null;
    readonly title: AnyWidget | null;
    readonly bottom: AnyWidget | null;
    readonly left: AnyWidget | null;
    readonly right: AnyWidget | null;
    /** The chart in force at `context`. */
    static of(context: RenderContext): ChartScope;
    constructor({ grid, datasets, overlay, title, bottom, left, right }: ChartOptions);
    /** Upstream `_computeSize`: square when an axis is unbounded. */
    private computeSize;
    private scope;
    private build;
    layout(context: RenderContext, constraints: Constraints): LayoutBox<ChartLayoutData>;
    paint(context: RenderContext, box: PositionedBox<ChartLayoutData>): void;
}
