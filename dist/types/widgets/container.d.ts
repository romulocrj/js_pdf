import type { ColorInput, Rgb } from '../pdf/color.ts';
import type { Insets, InsetsInput } from './geometry.ts';
import { Widget } from './widget.ts';
import type { AnyLayoutBox, AnyWidget, Constraints, LayoutBox, PositionedBox, RenderContext } from './widget.ts';
export interface ContainerOptions {
    readonly child?: AnyWidget | null;
    readonly width?: number | null;
    readonly height?: number | null;
    readonly padding?: InsetsInput;
    readonly margin?: InsetsInput;
    readonly background?: ColorInput | null;
    readonly borderColor?: ColorInput | null;
    readonly borderWidth?: number;
}
export interface ContainerLayoutData {
    readonly childBox: AnyLayoutBox | null;
    readonly boxWidth: number;
    readonly boxHeight: number;
}
export declare class Container extends Widget<ContainerLayoutData> {
    readonly child: AnyWidget | null;
    readonly width: number | null;
    readonly height: number | null;
    readonly padding: Insets;
    readonly margin: Insets;
    readonly background: Rgb | null;
    readonly borderColor: Rgb | null;
    readonly borderWidth: number;
    constructor({ child, width, height, padding, margin, background, borderColor, borderWidth }?: ContainerOptions);
    layout(context: RenderContext, constraints: Constraints): LayoutBox<ContainerLayoutData>;
    paint(context: RenderContext, box: PositionedBox<ContainerLayoutData>): void;
}
