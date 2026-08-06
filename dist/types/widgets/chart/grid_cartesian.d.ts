import type { Constraints, LayoutBox, PositionedBox, RenderContext } from '../widget.ts';
import { ChartFrame, ChartGrid } from './chart.ts';
import type { ChartGridLayoutData, ChartPoint, ChartRect } from './chart.ts';
import type { AxisLayout, GridAxis } from './grid_axis.ts';
/** The placement and value mapping of a `CartesianGrid`. */
export declare class CartesianFrame extends ChartFrame {
    readonly xAxis: GridAxis;
    readonly yAxis: GridAxis;
    readonly xLayout: AxisLayout;
    readonly yLayout: AxisLayout;
    readonly gridBox: ChartRect;
    constructor(xAxis: GridAxis, yAxis: GridAxis, xLayout: AxisLayout, yLayout: AxisLayout, gridBox: ChartRect, originX?: number, originPdfY?: number, originTop?: number);
    get xAxisOffset(): number;
    get yAxisOffset(): number;
    toChart(point: ChartPoint): ChartPoint;
    withOrigin(originX: number, originPdfY: number, originTop: number): CartesianFrame;
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
export declare class CartesianGrid extends ChartGrid<CartesianGridLayoutData> {
    readonly xAxis: GridAxis;
    readonly yAxis: GridAxis;
    constructor({ xAxis, yAxis }: CartesianGridOptions);
    layout(context: RenderContext, constraints: Constraints): LayoutBox<CartesianGridLayoutData>;
    paint(context: RenderContext, box: PositionedBox<CartesianGridLayoutData>): void;
    private clip;
}
