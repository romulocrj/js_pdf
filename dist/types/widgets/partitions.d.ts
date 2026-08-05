import type { MainAxisSize } from './flex.ts';
import { SpanningWidget } from './widget.ts';
import type { AnyLayoutBox, AnyWidget, Constraints, LayoutBox, PositionedBox, RenderContext, SpanLayout } from './widget.ts';
export interface PartitionOptions {
    readonly child: AnyWidget;
    readonly width?: number | null;
    readonly flex?: number;
}
export interface PartitionState {
    readonly done: boolean;
    readonly childState: unknown;
}
export interface PartitionLayoutData {
    readonly childBox: AnyLayoutBox | null;
}
/** One fixed-width or flexible column in `Partitions`. */
export declare class Partition extends SpanningWidget<PartitionLayoutData, PartitionState> {
    readonly child: AnyWidget;
    readonly width: number | null;
    readonly flex: number;
    constructor({ child, width, flex }: PartitionOptions);
    initialSpanState(): PartitionState;
    layout(context: RenderContext, constraints: Constraints): LayoutBox<PartitionLayoutData>;
    layoutSpan(context: RenderContext, constraints: Constraints, state: PartitionState): SpanLayout<PartitionLayoutData, PartitionState>;
    paint(context: RenderContext, box: PositionedBox<PartitionLayoutData>): void;
}
export interface PartitionsOptions {
    readonly children: readonly Partition[];
    readonly mainAxisSize?: MainAxisSize;
}
export interface PartitionsState {
    readonly children: readonly PartitionState[];
}
export interface PartitionChildLayout {
    readonly box: LayoutBox<PartitionLayoutData>;
    readonly dx: number;
}
export interface PartitionsLayoutData {
    readonly children: readonly PartitionChildLayout[];
}
/** Several independently continuing columns sharing one page band. */
export declare class Partitions extends SpanningWidget<PartitionsLayoutData, PartitionsState> {
    readonly children: readonly Partition[];
    readonly mainAxisSize: MainAxisSize;
    constructor({ children, mainAxisSize }: PartitionsOptions);
    initialSpanState(): PartitionsState;
    private widths;
    private fragment;
    layout(context: RenderContext, constraints: Constraints): LayoutBox<PartitionsLayoutData>;
    layoutSpan(context: RenderContext, constraints: Constraints, state: PartitionsState): SpanLayout<PartitionsLayoutData, PartitionsState>;
    paint(context: RenderContext, box: PositionedBox<PartitionsLayoutData>): void;
}
