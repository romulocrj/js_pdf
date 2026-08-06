import type { ColorInput, Rgb } from '../../pdf/color.ts';
import type { AnyWidget, RenderContext } from '../widget.ts';
import { ChartFrame } from './chart.ts';
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
export declare class LineDataSet extends PointDataSet {
    readonly lineWidth: number;
    readonly drawLine: boolean;
    readonly lineColor: Rgb | null;
    readonly drawSurface: boolean;
    readonly surfaceColor: Rgb | null;
    readonly surfaceOpacity: number;
    readonly isCurved: boolean;
    readonly smoothness: number;
    constructor({ data, legend, pointColor, pointSize, color, lineWidth, drawLine, lineColor, drawPoints, shape, buildValue, valuePosition, drawSurface, surfaceOpacity, surfaceColor, isCurved, smoothness, borderColor, borderWidth }: LineDataSetOptions);
    legendShape(context: RenderContext): AnyWidget;
    private drawPath;
    private drawArea;
    paintBackground(context: RenderContext, frame: ChartFrame, _data: null): void;
    paint(context: RenderContext, frame: ChartFrame, _data: null): void;
}
