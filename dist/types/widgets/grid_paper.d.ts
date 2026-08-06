import type { ColorInput } from '../pdf/color.ts';
import type { BoxBorder } from './box_border.ts';
import type { Insets, InsetsInput } from './geometry.ts';
import { Widget } from './widget.ts';
import type { AnyLayoutBox, AnyWidget, Constraints, LayoutBox, PositionedBox, RenderContext } from './widget.ts';
export interface GridPaperOptions {
    readonly color?: ColorInput;
    readonly horizontalColor?: ColorInput;
    readonly verticalColor?: ColorInput;
    readonly interval?: number;
    readonly horizontalInterval?: number;
    readonly verticalInterval?: number;
    readonly divisions?: number;
    readonly horizontalDivisions?: number;
    readonly verticalDivisions?: number;
    readonly subdivisions?: number;
    readonly horizontalSubdivisions?: number;
    readonly verticalSubdivisions?: number;
    readonly margin?: InsetsInput;
    readonly horizontalOffset?: number;
    readonly verticalOffset?: number;
    readonly border?: BoxBorder;
    readonly scale?: number;
    readonly opacity?: number;
    readonly child?: AnyWidget | null;
}
export interface GridPaperLayoutData {
    readonly childBox: AnyLayoutBox | null;
}
/** Draws configurable rectilinear paper over an optional child. */
export declare class GridPaper extends Widget<GridPaperLayoutData> {
    readonly horizontalColor: ColorInput;
    readonly verticalColor: ColorInput;
    readonly horizontalInterval: number;
    readonly verticalInterval: number;
    readonly horizontalDivisions: number;
    readonly verticalDivisions: number;
    readonly horizontalSubdivisions: number;
    readonly verticalSubdivisions: number;
    readonly margin: Insets;
    readonly horizontalOffset: number;
    readonly verticalOffset: number;
    readonly border: BoxBorder;
    readonly scale: number;
    readonly opacity: number;
    readonly child: AnyWidget | null;
    constructor({ color, horizontalColor, verticalColor, interval, horizontalInterval, verticalInterval, divisions, horizontalDivisions, verticalDivisions, subdivisions, horizontalSubdivisions, verticalSubdivisions, margin, horizontalOffset, verticalOffset, border, scale, opacity, child }?: GridPaperOptions);
    static millimeter({ color, child }?: Pick<GridPaperOptions, 'color' | 'child'>): GridPaper;
    static seyes({ margin, child }?: Pick<GridPaperOptions, 'margin' | 'child'>): GridPaper;
    static collegeRuled({ margin, child }?: Pick<GridPaperOptions, 'margin' | 'child'>): GridPaper;
    static quad({ color, child }?: Pick<GridPaperOptions, 'color' | 'child'>): GridPaper;
    static engineering({ color, child }?: Pick<GridPaperOptions, 'color' | 'child'>): GridPaper;
    layout(context: RenderContext, constraints: Constraints): LayoutBox<GridPaperLayoutData>;
    paint(context: RenderContext, box: PositionedBox<GridPaperLayoutData>): void;
}
