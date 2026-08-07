import type { ColorInput, Rgb } from '../../pdf/color.ts';
import type { TextAlign } from '../text.ts';
import { TextStyle } from '../text_style.ts';
import type { AnyLayoutBox, AnyWidget, Constraints, LayoutBox, PositionedBox, RenderContext } from '../widget.ts';
import { ChartFrame, ChartGrid, Dataset } from './chart.ts';
import type { ChartGridLayoutData, ChartPoint, DatasetOptions } from './chart.ts';
/** The placement of one slice inside a `PieGrid`. */
export declare class PieFrame extends ChartFrame {
    readonly radius: number;
    readonly angleStart: number;
    readonly angleEnd: number;
    constructor(radius: number, angleStart: number, angleEnd: number, originX?: number, originPdfY?: number, originTop?: number);
    toChart(point: ChartPoint): ChartPoint;
    withOrigin(originX: number, originPdfY: number, originTop: number): PieFrame;
}
export type PieLegendPosition = 'none' | 'auto' | 'inside' | 'outside';
export interface PieDataSetOptions extends DatasetOptions {
    readonly value: number;
    readonly legendWidget?: AnyWidget | null;
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
export declare class PieDataSet extends Dataset<PieSliceLayout> {
    readonly value: number;
    readonly legendWidget: AnyWidget | null;
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
    constructor({ value, legend, legendWidget, color, borderColor, borderWidth, drawBorder, drawSurface, surfaceOpacity, offset, legendStyle, legendAlign, legendPosition, legendLineWidth, legendLineColor, legendOffset, innerRadius }: PieDataSetOptions);
    private isFullCircle;
    layout(context: RenderContext, frame: ChartFrame): PieSliceLayout;
    private appendSlice;
    private appendDonut;
    private appendShape;
    paintBackground(context: RenderContext, frame: ChartFrame, _data: PieSliceLayout): void;
    paint(context: RenderContext, frame: ChartFrame, _data: PieSliceLayout): void;
    /** Upstream's protected `paintLegend`, called by `PieGrid` after the slices. */
    paintLegend(context: RenderContext, frame: ChartFrame, data: PieSliceLayout): void;
}
export interface PieGridOptions {
    readonly startAngle?: number;
}
export interface PieGridLayoutData extends ChartGridLayoutData {
    readonly radius: number;
    readonly angles: readonly {
        readonly start: number;
        readonly end: number;
    }[];
}
/** Slices laid out around a common centre. */
export declare class PieGrid extends ChartGrid<PieGridLayoutData> {
    readonly startAngle: number;
    constructor({ startAngle }?: PieGridOptions);
    layout(context: RenderContext, constraints: Constraints): LayoutBox<PieGridLayoutData>;
    paint(context: RenderContext, box: PositionedBox<PieGridLayoutData>): void;
}
