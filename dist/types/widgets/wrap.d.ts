import type { Axis, VerticalDirection } from './flex.ts';
import { SpanningWidget } from './widget.ts';
import type { AnyLayoutBox, AnyWidget, Constraints, LayoutBox, PositionedBox, RenderContext, SpanLayout } from './widget.ts';
export type WrapAlignment = 'start' | 'end' | 'center' | 'spaceBetween' | 'spaceAround' | 'spaceEvenly';
export type WrapCrossAlignment = 'start' | 'end' | 'center';
export interface WrapOptions {
    readonly direction?: Axis;
    readonly alignment?: WrapAlignment;
    readonly spacing?: number;
    readonly runAlignment?: WrapAlignment;
    readonly runSpacing?: number;
    readonly crossAxisAlignment?: WrapCrossAlignment;
    readonly verticalDirection?: VerticalDirection;
    readonly children?: readonly AnyWidget[];
}
export interface WrapState {
    readonly firstChild: number;
}
export interface WrapChildLayout {
    readonly box: AnyLayoutBox;
    readonly dx: number;
    readonly dy: number;
}
export interface WrapLayoutData {
    readonly children: readonly WrapChildLayout[];
    readonly firstChild: number;
    readonly lastChild: number;
    readonly runCount: number;
}
/** Places children into successive runs and can resume at a run boundary. */
export declare class Wrap extends SpanningWidget<WrapLayoutData, WrapState> {
    readonly direction: Axis;
    readonly alignment: WrapAlignment;
    readonly spacing: number;
    readonly runAlignment: WrapAlignment;
    readonly runSpacing: number;
    readonly crossAxisAlignment: WrapCrossAlignment;
    readonly verticalDirection: VerticalDirection;
    readonly children: readonly AnyWidget[];
    constructor({ direction, alignment, spacing, runAlignment, runSpacing, crossAxisAlignment, verticalDirection, children }?: WrapOptions);
    initialSpanState(): WrapState;
    private fragment;
    layout(context: RenderContext, constraints: Constraints): LayoutBox<WrapLayoutData>;
    layoutSpan(context: RenderContext, constraints: Constraints, state: WrapState): SpanLayout<WrapLayoutData, WrapState>;
    paint(context: RenderContext, box: PositionedBox<WrapLayoutData>): void;
}
