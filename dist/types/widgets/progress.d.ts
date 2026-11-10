import type { ColorInput } from '../pdf/color.ts';
import { Widget } from './widget.ts';
import type { Constraints, LayoutBox, PositionedBox, RenderContext } from './widget.ts';
export interface CircularProgressIndicatorOptions {
    readonly value: number;
    readonly color?: ColorInput | null;
    readonly strokeWidth?: number;
    readonly backgroundColor?: ColorInput | null;
    /** The width to take when the parent leaves the width unbounded. */
    readonly fallbackWidth?: number | null;
    /** The height to take when the parent leaves the height unbounded. */
    readonly fallbackHeight?: number | null;
}
/** A determinate circular progress ring. */
export declare class CircularProgressIndicator extends Widget<null> {
    readonly value: number;
    readonly color: ColorInput | null;
    readonly strokeWidth: number;
    readonly backgroundColor: ColorInput | null;
    readonly fallbackWidth: number | null;
    readonly fallbackHeight: number | null;
    constructor({ value, color, strokeWidth, backgroundColor, fallbackWidth, fallbackHeight }: CircularProgressIndicatorOptions);
    layout(_context: RenderContext, constraints: Constraints): LayoutBox<null>;
    paint(context: RenderContext, box: PositionedBox<null>): void;
}
export interface LinearProgressIndicatorOptions {
    readonly value: number;
    readonly backgroundColor?: ColorInput | null;
    readonly valueColor?: ColorInput | null;
    readonly minHeight?: number | null;
    /** The width to take when the parent leaves the width unbounded. */
    readonly fallbackWidth?: number | null;
}
/** A determinate material-design progress bar. */
export declare class LinearProgressIndicator extends Widget<null> {
    readonly value: number;
    readonly backgroundColor: ColorInput | null;
    readonly valueColor: ColorInput | null;
    readonly minHeight: number | null;
    readonly fallbackWidth: number | null;
    constructor({ value, backgroundColor, valueColor, minHeight, fallbackWidth }: LinearProgressIndicatorOptions);
    layout(_context: RenderContext, constraints: Constraints): LayoutBox<null>;
    paint(context: RenderContext, box: PositionedBox<null>): void;
}
