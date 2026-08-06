import type { ColorInput, Rgb } from '../pdf/color.ts';
import type { BasicAlignmentInput } from './basic.ts';
import { BoxDecoration } from './decoration.ts';
import type { BoxDecorationInput, DecorationPosition } from './decoration.ts';
import { Alignment } from './geometry.ts';
import type { Insets, InsetsInput } from './geometry.ts';
import { SpanningWidget, Widget } from './widget.ts';
import type { AnyLayoutBox, AnyWidget, Constraints, LayoutBox, PositionedBox, RenderContext, SpanLayout } from './widget.ts';
export interface ContainerOptions {
    readonly child?: AnyWidget | null;
    readonly width?: number | null;
    readonly height?: number | null;
    readonly padding?: InsetsInput;
    readonly margin?: InsetsInput;
    readonly background?: ColorInput | null;
    readonly borderColor?: ColorInput | null;
    readonly borderWidth?: number;
    readonly decoration?: BoxDecorationInput | null;
    readonly foregroundDecoration?: BoxDecorationInput | null;
    readonly alignment?: BasicAlignmentInput | null;
}
export interface ContainerLayoutData {
    readonly childBox: AnyLayoutBox | null;
    readonly boxWidth: number;
    readonly boxHeight: number;
    readonly childX: number;
    readonly childY: number;
}
export interface ContainerState {
    readonly childState: unknown;
}
export interface DecoratedBoxOptions {
    readonly decoration: BoxDecorationInput;
    readonly position?: DecorationPosition;
    readonly child?: AnyWidget | null;
}
/** Paints a decoration before or after its child without affecting layout. */
export declare class DecoratedBox extends Widget<{
    readonly childBox: AnyLayoutBox | null;
}> {
    readonly decoration: BoxDecoration;
    readonly position: DecorationPosition;
    readonly child: AnyWidget | null;
    constructor({ decoration, position, child }: DecoratedBoxOptions);
    layout(context: RenderContext, constraints: Constraints): LayoutBox<{
        readonly childBox: AnyLayoutBox | null;
    }>;
    paint(context: RenderContext, box: PositionedBox<{
        readonly childBox: AnyLayoutBox | null;
    }>): void;
}
export declare class Container extends SpanningWidget<ContainerLayoutData, ContainerState> {
    readonly child: AnyWidget | null;
    readonly width: number | null;
    readonly height: number | null;
    readonly padding: Insets;
    readonly margin: Insets;
    readonly background: Rgb | null;
    readonly borderColor: Rgb | null;
    readonly borderWidth: number;
    readonly decoration: BoxDecoration | null;
    readonly foregroundDecoration: BoxDecoration | null;
    readonly alignment: Alignment | null;
    get canSpan(): boolean;
    constructor({ child, width, height, padding, margin, background, borderColor, borderWidth, decoration, foregroundDecoration, alignment }?: ContainerOptions);
    initialSpanState(): ContainerState;
    private finishLayout;
    layout(context: RenderContext, constraints: Constraints): LayoutBox<ContainerLayoutData>;
    layoutSpan(context: RenderContext, constraints: Constraints, state: ContainerState): SpanLayout<ContainerLayoutData, ContainerState>;
    paint(context: RenderContext, box: PositionedBox<ContainerLayoutData>): void;
}
