import type { ConstraintSize } from '../geometry.ts';
import type { AnyWidget, RenderContext } from '../widget.ts';
import { ChartFrame, Dataset } from './chart.ts';
import type { ChartPoint, ChartRect, DatasetOptions } from './chart.ts';
export type ValuePosition = 'left' | 'top' | 'right' | 'bottom' | 'auto';
/** One (x, y) sample of a cartesian data set. */
export declare class PointChartValue {
    readonly x: number;
    readonly y: number;
    constructor(x: number, y: number);
    get point(): ChartPoint;
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
export declare class PointDataSet extends Dataset<null> {
    readonly data: readonly PointChartValue[];
    readonly drawPoints: boolean;
    readonly pointSize: number;
    readonly shape: PointShapeBuilder | null;
    readonly buildValue: PointValueBuilder | null;
    readonly valuePosition: ValuePosition;
    constructor({ data, pointSize, drawPoints, shape, buildValue, valuePosition, color, borderColor, borderWidth, legend }: PointDataSetOptions);
    get delta(): number;
    layout(_context: RenderContext, _frame: ChartFrame): null;
    automaticValuePosition(point: ChartPoint, size: ConstraintSize, _previous: ChartPoint | null, _next: ChartPoint | null, box: ChartRect): ValuePosition;
    paintForeground(context: RenderContext, frame: ChartFrame, _data: null): void;
    legendShape(context: RenderContext): AnyWidget;
}
