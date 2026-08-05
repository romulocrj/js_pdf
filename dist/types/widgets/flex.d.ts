import type { Insets, InsetsInput } from './geometry.ts';
import { Widget } from './widget.ts';
import type { AnyLayoutBox, AnyWidget, Constraints, LayoutBox, PositionedBox, RenderContext } from './widget.ts';
export interface ColumnOptions {
    readonly children?: readonly AnyWidget[];
    readonly gap?: number;
    readonly margin?: InsetsInput;
}
export interface RowOptions extends ColumnOptions {
    /** Relative column widths. Defaults to equal shares. */
    readonly widths?: readonly number[] | null;
}
export interface FlexLayoutData {
    readonly childBoxes: readonly AnyLayoutBox[];
}
/** A child box plus the track width `Row` allocated to it. */
export type RowChildBox = AnyLayoutBox & {
    readonly allocatedWidth: number;
};
export interface RowLayoutData {
    readonly childBoxes: readonly RowChildBox[];
}
/** Fixed vertical gap. Upstream `Spacer` is proportional flex space. */
export declare class Spacer extends Widget<null> {
    readonly requestedHeight: number;
    constructor(height?: number);
    layout(_context: RenderContext, constraints: Constraints): LayoutBox<null>;
    paint(): void;
}
export declare class Column extends Widget<FlexLayoutData> {
    readonly children: readonly AnyWidget[];
    readonly gap: number;
    readonly margin: Insets;
    constructor({ children, gap, margin }?: ColumnOptions);
    layout(context: RenderContext, constraints: Constraints): LayoutBox<FlexLayoutData>;
    paint(context: RenderContext, box: PositionedBox<FlexLayoutData>): void;
}
export declare class Row extends Widget<RowLayoutData> {
    readonly children: readonly AnyWidget[];
    readonly gap: number;
    readonly widths: readonly number[] | null;
    readonly margin: Insets;
    constructor({ children, gap, widths, margin }?: RowOptions);
    layout(context: RenderContext, constraints: Constraints): LayoutBox<RowLayoutData>;
    paint(context: RenderContext, box: PositionedBox<RowLayoutData>): void;
}
