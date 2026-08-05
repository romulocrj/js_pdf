import type { Axis } from './flex.ts';
import type { Insets, InsetsInput } from './geometry.ts';
import { SpanningWidget } from './widget.ts';
import type { AnyLayoutBox, AnyWidget, Constraints, LayoutBox, PositionedBox, RenderContext, SpanLayout } from './widget.ts';
export interface GridViewOptions {
    readonly direction?: Axis;
    readonly padding?: InsetsInput;
    readonly crossAxisCount: number;
    readonly mainAxisSpacing?: number;
    readonly crossAxisSpacing?: number;
    readonly childAspectRatio?: number;
    readonly children?: readonly AnyWidget[];
}
export interface GridViewState {
    readonly firstChild: number;
    readonly childCrossAxis: number | null;
    readonly childMainAxis: number | null;
}
export interface GridChildLayout {
    readonly box: AnyLayoutBox;
    readonly dx: number;
    readonly dy: number;
}
export interface GridViewLayoutData {
    readonly children: readonly GridChildLayout[];
    readonly firstChild: number;
    readonly lastChild: number;
    readonly childCrossAxis: number;
    readonly childMainAxis: number;
}
/** A fixed-track grid that can continue on later `MultiPage` pages. */
export declare class GridView extends SpanningWidget<GridViewLayoutData, GridViewState> {
    readonly direction: Axis;
    readonly padding: Insets;
    readonly crossAxisCount: number;
    readonly mainAxisSpacing: number;
    readonly crossAxisSpacing: number;
    readonly childAspectRatio: number;
    readonly children: readonly AnyWidget[];
    constructor({ direction, padding, crossAxisCount, mainAxisSpacing, crossAxisSpacing, childAspectRatio, children }: GridViewOptions);
    initialSpanState(): GridViewState;
    private fragment;
    layout(context: RenderContext, constraints: Constraints): LayoutBox<GridViewLayoutData>;
    layoutSpan(context: RenderContext, constraints: Constraints, state: GridViewState): SpanLayout<GridViewLayoutData, GridViewState>;
    paint(context: RenderContext, box: PositionedBox<GridViewLayoutData>): void;
}
