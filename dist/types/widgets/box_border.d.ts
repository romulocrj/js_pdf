import type { ColorInput, Rgb } from '../pdf/color.ts';
import type { PdfCanvas } from '../pdf/graphics.ts';
import { BorderRadius } from './border_radius.ts';
import type { BoxShape } from './decoration.ts';
import type { RenderContext } from './widget.ts';
export interface BorderStyleOptions {
    readonly paint?: boolean;
    readonly pattern?: readonly number[] | null;
    readonly phase?: number;
}
/** Solid, absent or dashed line behavior for one border side. */
export declare class BorderStyle {
    static readonly none: BorderStyle;
    static readonly solid: BorderStyle;
    static readonly dashed: BorderStyle;
    static readonly dotted: BorderStyle;
    readonly paint: boolean;
    readonly pattern: readonly number[] | null;
    readonly phase: number;
    constructor({ paint, pattern, phase }?: BorderStyleOptions);
    setStyle(canvas: PdfCanvas): boolean;
    unsetStyle(canvas: PdfCanvas, saved: boolean): void;
}
export type BorderStyleInput = BorderStyle | 'none' | 'solid' | 'dashed' | 'dotted';
export interface BorderSideOptions {
    readonly color?: ColorInput;
    readonly width?: number;
    readonly style?: BorderStyleInput;
}
/** One immutable side of a box border. */
export declare class BorderSide {
    static readonly none: BorderSide;
    readonly color: Rgb;
    readonly width: number;
    readonly style: BorderStyle;
    constructor({ color, width, style }?: BorderSideOptions);
    copyWith({ color, width, style }?: BorderSideOptions): BorderSide;
    equals(other: BorderSide): boolean;
}
export type BorderSideInput = BorderSide | BorderSideOptions;
export interface BoxBorderPaintOptions {
    readonly shape?: BoxShape;
    readonly borderRadius?: BorderRadius | null;
}
/** Base class shared by physical box borders. */
export declare abstract class BoxBorder {
    abstract readonly top: BorderSide;
    abstract readonly right: BorderSide;
    abstract readonly bottom: BorderSide;
    abstract readonly left: BorderSide;
    abstract get isUniform(): boolean;
    abstract paint(context: RenderContext, x: number, y: number, width: number, height: number, options?: BoxBorderPaintOptions): void;
}
export interface BorderOptions {
    readonly top?: BorderSideInput | null;
    readonly right?: BorderSideInput | null;
    readonly bottom?: BorderSideInput | null;
    readonly left?: BorderSideInput | null;
}
/** Four independently styled physical sides. */
export declare class Border extends BoxBorder {
    readonly top: BorderSide;
    readonly right: BorderSide;
    readonly bottom: BorderSide;
    readonly left: BorderSide;
    constructor({ top, right, bottom, left }?: BorderOptions);
    static all(options?: BorderSideOptions): Border;
    static fromBorderSide(value: BorderSideInput): Border;
    static symmetric({ vertical, horizontal }?: {
        readonly vertical?: BorderSideInput;
        readonly horizontal?: BorderSideInput;
    }): Border;
    get isUniform(): boolean;
    private paintUniform;
    private paintSide;
    paint(context: RenderContext, x: number, y: number, width: number, height: number, { shape, borderRadius }?: BoxBorderPaintOptions): void;
}
export type BoxBorderInput = BoxBorder | BorderOptions;
export declare function normalizeBoxBorder(value: BoxBorderInput | null | undefined): BoxBorder | null;
