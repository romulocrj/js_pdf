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
    /**
     * Draw with this font instead of the document's default. The minimal form of
     * upstream's `TextStyle.font`, added in phase 0.3 because a per-page resource
     * dictionary is pointless if nothing can ask for a second font; phase 1.4
     * folds it into a real `TextStyle`.
     */
    readonly font?: PdfFont;
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
    readonly font: PdfFont | null;
    constructor(value: string, { fontSize, lineHeight, color, align, margin, font }?: TextOptions);
    /**
     * Resolved per call rather than in the constructor: the document's default is
     * not known until render time, and `layout()` must stay free of cached state.
     */
    private resolveFont;
    layout(context: RenderContext, constraints: Constraints): LayoutBox<TextLayoutData>;
    paint(context: RenderContext, box: PositionedBox<TextLayoutData>): void;
}
