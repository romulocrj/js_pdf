import type { BasicAlignmentInput } from './basic.ts';
import type { AlignmentGeometry } from './geometry.ts';
import type { TextDirection } from './border_radius.ts';
import { Widget } from './widget.ts';
import type { AnyLayoutBox, AnyWidget, Constraints, LayoutBox, PositionedBox, RenderContext } from './widget.ts';
export type StackFit = 'loose' | 'expand' | 'passthrough';
export type StackOverflow = 'visible' | 'clip';
export interface PositionedOptions {
    readonly left?: number | null;
    readonly top?: number | null;
    readonly right?: number | null;
    readonly bottom?: number | null;
    readonly width?: number | null;
    readonly height?: number | null;
    readonly child: AnyWidget;
}
export interface PositionedLayoutData {
    readonly childBox: AnyLayoutBox;
}
/** Marks a direct `Stack` child as edge-positioned. */
export declare class Positioned extends Widget<PositionedLayoutData> {
    readonly left: number | null;
    readonly top: number | null;
    readonly right: number | null;
    readonly bottom: number | null;
    readonly width: number | null;
    readonly height: number | null;
    readonly child: AnyWidget;
    constructor({ left, top, right, bottom, width, height, child }: PositionedOptions);
    static fill({ left, top, right, bottom, child }: Omit<PositionedOptions, 'width' | 'height'>): Positioned;
    static directional({ textDirection, start, top, end, bottom, width, height, child }: PositionedDirectionalOptions & {
        readonly textDirection: TextDirection;
    }): Positioned;
    layout(context: RenderContext, constraints: Constraints): LayoutBox<PositionedLayoutData>;
    paint(context: RenderContext, box: PositionedBox<PositionedLayoutData>): void;
}
export interface PositionedDirectionalOptions {
    readonly start?: number | null;
    readonly top?: number | null;
    readonly end?: number | null;
    readonly bottom?: number | null;
    readonly width?: number | null;
    readonly height?: number | null;
    readonly child: AnyWidget;
    /** Port extension: resolve against this instead of the ambient direction. */
    readonly textDirection?: TextDirection | null;
}
/**
 * A positioned child placed by `start` and `end`. Upstream resolves them with
 * `Directionality.of` when it is laid out, and so does the port: `left` and
 * `right` hold the ltr reading, and a `Stack` swaps them under rtl. A given
 * `textDirection` resolves them once, here, as this port always used to.
 */
export declare class PositionedDirectional extends Positioned {
    readonly start: number | null;
    readonly end: number | null;
    readonly textDirection: TextDirection | null;
    constructor({ start, top, end, bottom, width, height, child, textDirection }: PositionedDirectionalOptions);
    static fill({ start, top, end, bottom, child, textDirection }: Omit<PositionedDirectionalOptions, 'width' | 'height'>): PositionedDirectional;
}
export interface StackOptions {
    readonly alignment?: BasicAlignmentInput;
    readonly fit?: StackFit;
    readonly overflow?: StackOverflow;
    readonly children?: readonly AnyWidget[];
}
export interface StackChildLayout {
    readonly box: AnyLayoutBox;
    readonly dx: number;
    readonly dy: number;
}
export interface StackLayoutData {
    readonly children: readonly StackChildLayout[];
}
/** Overlays children inside one shared box. */
export declare class Stack extends Widget<StackLayoutData> {
    readonly alignment: AlignmentGeometry;
    readonly fit: StackFit;
    readonly overflow: StackOverflow;
    readonly children: readonly AnyWidget[];
    constructor({ alignment, fit, overflow, children }?: StackOptions);
    layout(context: RenderContext, incoming: Constraints): LayoutBox<StackLayoutData>;
    paint(context: RenderContext, box: PositionedBox<StackLayoutData>): void;
}
