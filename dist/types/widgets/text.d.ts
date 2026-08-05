import type { ColorInput, Rgb } from '../pdf/color.ts';
import type { PdfFont } from '../pdf/font/font.ts';
import type { Insets, InsetsInput } from './geometry.ts';
import { Widget } from './widget.ts';
import type { Constraints, LayoutBox, PositionedBox, RenderContext } from './widget.ts';
export declare const DEFAULT_FONT_SIZE = 12;
export declare const DEFAULT_LINE_HEIGHT = 1.2;
export type TextAlign = 'left' | 'center' | 'right';
export interface TextOptions {
    readonly fontSize?: number;
    readonly lineHeight?: number;
    readonly color?: ColorInput;
    readonly align?: TextAlign;
    readonly margin?: InsetsInput;
}
export interface TextLayoutData {
    readonly lines: readonly string[];
    readonly lineAdvance: number;
    readonly contentWidth: number;
}
/** Greedy line breaker. Explicit newlines always start a new line. */
export declare function wrapText(value: string, maxWidth: number, fontSize: number, font?: PdfFont): string[];
export declare class Text extends Widget<TextLayoutData> {
    readonly value: string;
    readonly fontSize: number;
    readonly lineHeight: number;
    readonly color: Rgb;
    readonly align: TextAlign;
    readonly margin: Insets;
    constructor(value: string, { fontSize, lineHeight, color, align, margin }?: TextOptions);
    layout(context: RenderContext, constraints: Constraints): LayoutBox<TextLayoutData>;
    paint(context: RenderContext, box: PositionedBox<TextLayoutData>): void;
}
