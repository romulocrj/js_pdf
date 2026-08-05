import type { Insets, InsetsInput } from './geometry.ts';
import { Widget } from './widget.ts';
import type { AnyLayoutBox, AnyWidget, Constraints, LayoutBox, PositionedBox, RenderContext } from './widget.ts';
export type Axis = 'horizontal' | 'vertical';
export type FlexFit = 'tight' | 'loose';
export type MainAxisSize = 'min' | 'max';
export type MainAxisAlignment = 'start' | 'end' | 'center' | 'spaceBetween' | 'spaceAround' | 'spaceEvenly';
export type CrossAxisAlignment = 'start' | 'end' | 'center' | 'stretch';
export type VerticalDirection = 'up' | 'down';
export interface FlexOptions {
    readonly direction: Axis;
    readonly children?: readonly AnyWidget[];
    readonly mainAxisAlignment?: MainAxisAlignment;
    readonly mainAxisSize?: MainAxisSize;
    readonly crossAxisAlignment?: CrossAxisAlignment;
    readonly verticalDirection?: VerticalDirection;
    readonly gap?: number;
    readonly margin?: InsetsInput;
    /** Legacy weighted tracks. Only valid for a horizontal flex. */
    readonly widths?: readonly number[] | null;
}
export interface ColumnOptions extends Omit<FlexOptions, 'direction' | 'widths'> {
}
export interface RowOptions extends Omit<FlexOptions, 'direction'> {
}
export interface FlexibleOptions {
    readonly flex?: number;
    readonly fit?: FlexFit;
    readonly child: AnyWidget;
}
export interface ExpandedOptions extends Omit<FlexibleOptions, 'fit'> {
    readonly fit?: FlexFit;
}
export interface FlexChildLayout {
    readonly box: AnyLayoutBox;
    readonly dx: number;
    readonly dy: number;
}
export interface FlexLayoutData {
    readonly children: readonly FlexChildLayout[];
}
export interface FlexibleLayoutData {
    readonly childBox: AnyLayoutBox;
}
/** Controls how a direct child of `Flex`, `Row` or `Column` uses free space. */
export declare class Flexible extends Widget<FlexibleLayoutData> {
    readonly flex: number;
    readonly fit: FlexFit;
    readonly child: AnyWidget;
    constructor({ flex, fit, child }: FlexibleOptions);
    layout(context: RenderContext, constraints: Constraints): LayoutBox<FlexibleLayoutData>;
    paint(context: RenderContext, box: PositionedBox<FlexibleLayoutData>): void;
}
/** A flexible child that fills its allocated main-axis extent by default. */
export declare class Expanded extends Flexible {
    constructor({ flex, fit, child }: ExpandedOptions);
}
/** Empty proportional space inside a flex container. */
export declare class Spacer extends Expanded {
    constructor(options?: number | {
        readonly flex?: number;
    });
}
/** The shared upstream flex algorithm behind `Row` and `Column`. */
export declare class Flex extends Widget<FlexLayoutData> {
    readonly direction: Axis;
    readonly children: readonly AnyWidget[];
    readonly mainAxisAlignment: MainAxisAlignment;
    readonly mainAxisSize: MainAxisSize;
    readonly crossAxisAlignment: CrossAxisAlignment;
    readonly verticalDirection: VerticalDirection;
    readonly gap: number;
    readonly margin: Insets;
    readonly widths: readonly number[] | null;
    constructor({ direction, children, mainAxisAlignment, mainAxisSize, crossAxisAlignment, verticalDirection, gap, margin, widths }: FlexOptions);
    private crossConstraints;
    layout(context: RenderContext, incoming: Constraints): LayoutBox<FlexLayoutData>;
    paint(context: RenderContext, box: PositionedBox<FlexLayoutData>): void;
}
export declare class Row extends Flex {
    constructor(options?: RowOptions);
}
export declare class Column extends Flex {
    constructor(options?: ColumnOptions);
}
