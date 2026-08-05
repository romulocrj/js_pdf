import type { ColorInput, Rgb } from '../pdf/color.ts';
import type { PdfFont } from '../pdf/font/font.ts';
import type { Insets, InsetsInput } from './geometry.ts';
import type { TextStyle } from './text_style.ts';
import { DEFAULT_FONT_SIZE, DEFAULT_LINE_HEIGHT } from './text_style.ts';
import { Widget } from './widget.ts';
import type { Constraints, LayoutBox, PositionedBox, RenderContext } from './widget.ts';
export { DEFAULT_FONT_SIZE, DEFAULT_LINE_HEIGHT };
/**
 * PORT GAP: `justify` is accepted but painted as `left`. Justifying means
 * distributing the slack across a line's word gaps, which is part of the real
 * line breaker in roadmap phase 3.7.
 */
export type TextAlign = 'left' | 'center' | 'right' | 'justify';
/** Upstream's `TextOverflow`. Carried by the theme; not yet acted on. */
export type TextOverflow = 'clip' | 'visible' | 'span';
export interface TextOptions {
    /** Merged onto the theme's default text style. */
    readonly style?: TextStyle;
    readonly fontSize?: number;
    readonly lineHeight?: number;
    readonly color?: ColorInput;
    readonly align?: TextAlign;
    readonly margin?: InsetsInput;
    /** Drop every line past this one. Upstream's `maxLines`. */
    readonly maxLines?: number;
    /**
     * Draw with this font object, bypassing the theme entirely. Predates
     * `TextStyle` — a `Font` declaration belongs in `style.font`; this is the
     * escape hatch for a caller holding a `PdfFont`.
     */
    readonly font?: PdfFont;
}
/** A `TextStyle` with every field the painter needs already decided. */
interface ResolvedTextStyle {
    readonly font: PdfFont;
    readonly fontSize: number;
    readonly color: Rgb;
    readonly align: TextAlign;
    readonly lineAdvance: number;
    readonly letterSpacing: number;
    readonly wordSpacing: number;
    readonly maxLines: number | null;
}
export interface TextLayoutData {
    readonly lines: readonly string[];
    readonly lineAdvance: number;
    readonly contentWidth: number;
    readonly style: ResolvedTextStyle;
}
/** Greedy line breaker. Explicit newlines always start a new line. */
export declare function wrapText(value: string, maxWidth: number, fontSize: number, font?: PdfFont): string[];
export declare class Text extends Widget<TextLayoutData> {
    readonly value: string;
    readonly style: TextStyle | null;
    readonly fontSize: number | null;
    readonly lineHeight: number | null;
    readonly color: Rgb | null;
    readonly align: TextAlign | null;
    readonly margin: Insets;
    readonly maxLines: number | null;
    readonly font: PdfFont | null;
    constructor(value: string, { style, fontSize, lineHeight, color, align, margin, maxLines, font }?: TextOptions);
    /**
     * Resolved per call rather than in the constructor: neither the theme nor the
     * document's fonts exist until render time, and `layout()` must stay free of
     * cached state — `MultiPage` re-lays the same instance on the next page.
     */
    private resolveStyle;
    layout(context: RenderContext, constraints: Constraints): LayoutBox<TextLayoutData>;
    paint(context: RenderContext, box: PositionedBox<TextLayoutData>): void;
}
