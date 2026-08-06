import type { ColorInput, Rgb } from '../../pdf/color.ts';
import type { Axis } from '../flex.ts';
import type { ConstraintSize } from '../geometry.ts';
import type { AnyWidget, RenderContext } from '../widget.ts';
import { ChartFrame } from './chart.ts';
import type { ChartPoint, ChartRect } from './chart.ts';
import { PointDataSet } from './point_chart.ts';
import type { PointDataSetOptions, ValuePosition } from './point_chart.ts';
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
export declare class BarDataSet extends PointDataSet {
    readonly drawBorder: boolean;
    readonly drawSurface: boolean;
    readonly surfaceOpacity: number;
    readonly barWidth: number;
    readonly offset: number;
    readonly axis: Axis;
    readonly surfaceColor: Rgb;
    constructor({ data, legend, borderColor, borderWidth, color, drawBorder, drawSurface, surfaceOpacity, width, offset, axis, pointColor, pointSize, drawPoints, shape, buildValue, valuePosition }: BarDataSetOptions);
    legendShape(context: RenderContext): AnyWidget;
    private drawBar;
    paint(context: RenderContext, frame: ChartFrame, _data: null): void;
    automaticValuePosition(point: ChartPoint, size: ConstraintSize, previous: ChartPoint | null, next: ChartPoint | null, box: ChartRect): ValuePosition;
}
