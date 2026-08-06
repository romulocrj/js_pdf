import type { ColorInput } from '../pdf/color.ts';
import { Widget } from './widget.ts';
import type { Constraints, LayoutBox, PositionedBox, RenderContext } from './widget.ts';
export interface CircularProgressIndicatorOptions {
    readonly value: number;
    readonly color?: ColorInput | null;
    readonly strokeWidth?: number;
    readonly backgroundColor?: ColorInput | null;
}
/** A determinate circular progress ring. */
export declare class CircularProgressIndicator extends Widget<null> {
    readonly value: number;
    readonly color: ColorInput | null;
    readonly strokeWidth: number;
    readonly backgroundColor: ColorInput | null;
    constructor({ value, color, strokeWidth, backgroundColor }: CircularProgressIndicatorOptions);
    layout(_context: RenderContext, constraints: Constraints): LayoutBox<null>;
    paint(context: RenderContext, box: PositionedBox<null>): void;
}
export interface LinearProgressIndicatorOptions {
    readonly value: number;
    readonly backgroundColor?: ColorInput | null;
    readonly valueColor?: ColorInput | null;
    readonly minHeight?: number | null;
}
/** A determinate material-design progress bar. */
export declare class LinearProgressIndicator extends Widget<null> {
    readonly value: number;
    readonly backgroundColor: ColorInput | null;
    readonly valueColor: ColorInput | null;
    readonly minHeight: number | null;
    constructor({ value, backgroundColor, valueColor, minHeight }: LinearProgressIndicatorOptions);
    layout(_context: RenderContext, constraints: Constraints): LayoutBox<null>;
    paint(context: RenderContext, box: PositionedBox<null>): void;
}
