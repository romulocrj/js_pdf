import type { Constraints, LayoutBox, PositionedBox, RenderContext } from '../widget.ts';
import { ChartFrame, ChartGrid } from './chart.ts';
import type { ChartGridLayoutData, ChartPoint } from './chart.ts';
/** The placement of a `RadialGrid`. */
export declare class RadialFrame extends ChartFrame {
    readonly width: number;
    readonly height: number;
    constructor(width: number, height: number, originX?: number, originPdfY?: number, originTop?: number);
    toChart(point: ChartPoint): ChartPoint;
    withOrigin(originX: number, originPdfY: number, originTop: number): RadialFrame;
}
export interface RadialGridLayoutData extends ChartGridLayoutData {
    readonly frame: RadialFrame;
}
/** Polar coordinates. Upstream marks this experimental; it is ported as-is. */
export declare class RadialGrid extends ChartGrid<RadialGridLayoutData> {
    layout(context: RenderContext, constraints: Constraints): LayoutBox<RadialGridLayoutData>;
    paint(context: RenderContext, box: PositionedBox<RadialGridLayoutData>): void;
    private clip;
}
