import type { ColorInput, Rgb } from '../pdf/color.ts';
import { Font } from './font.ts';
export type FontWeight = 'normal' | 'bold';
export type FontStyle = 'normal' | 'italic';
export type TextDecoration = 'none' | 'underline' | 'overline' | 'lineThrough';
export type TextDecorationStyle = 'solid' | 'double';
/** 12 points, upstream's `TextStyle._defaultFontSize`. */
export declare const DEFAULT_FONT_SIZE = 12;
/**
 * Upstream's default `height` is 1 — a line box exactly one em tall. The port
 * has used 1.2 since before styles existed, and `Text` still reads this value,
 * so changing it would move every line of every existing document.
 */
export declare const DEFAULT_LINE_HEIGHT = 1.2;
export interface TextStyleOptions {
    readonly inherit?: boolean;
    readonly color?: ColorInput | null;
    /** Distributed into the slot `fontWeight` and `fontStyle` select. */
    readonly font?: Font | null;
    readonly fontNormal?: Font | null;
    readonly fontBold?: Font | null;
    readonly fontItalic?: Font | null;
    readonly fontBoldItalic?: Font | null;
    readonly fontFallback?: readonly Font[] | null;
    readonly fontSize?: number | null;
    readonly fontWeight?: FontWeight | null;
    readonly fontStyle?: FontStyle | null;
    /** Extra space per glyph, in PDF units — the `Tc` operand. */
    readonly letterSpacing?: number | null;
    /** Extra space per space character, in PDF units — the `Tw` operand. */
    readonly wordSpacing?: number | null;
    /** Extra space between lines, in PDF units, on top of `height`. */
    readonly lineSpacing?: number | null;
    /** Line box height as a multiple of the font size. */
    readonly height?: number | null;
    readonly decoration?: TextDecoration | null;
    readonly decorationColor?: ColorInput | null;
    readonly decorationStyle?: TextDecorationStyle | null;
    readonly decorationThickness?: number | null;
}
export declare class TextStyle {
    readonly inherit: boolean;
    readonly color: Rgb | null;
    readonly fontNormal: Font | null;
    readonly fontBold: Font | null;
    readonly fontItalic: Font | null;
    readonly fontBoldItalic: Font | null;
    readonly fontFallback: readonly Font[];
    readonly fontSize: number | null;
    readonly fontWeight: FontWeight | null;
    readonly fontStyle: FontStyle | null;
    readonly letterSpacing: number | null;
    readonly wordSpacing: number | null;
    readonly lineSpacing: number | null;
    readonly height: number | null;
    readonly decoration: TextDecoration | null;
    readonly decorationColor: Rgb | null;
    readonly decorationStyle: TextDecorationStyle | null;
    readonly decorationThickness: number | null;
    constructor({ inherit, color, font, fontNormal, fontBold, fontItalic, fontBoldItalic, fontFallback, fontSize, fontWeight, fontStyle, letterSpacing, wordSpacing, lineSpacing, height, decoration, decorationColor, decorationStyle, decorationThickness }?: TextStyleOptions);
    /**
     * The complete style every other one is merged onto: Helvetica in its four
     * faces, black, 12 points.
     */
    static defaultStyle(): TextStyle;
    /**
     * The font for this style's weight and slant, falling through to whichever
     * slot is filled — a theme that names only a regular face still draws bold
     * text, in the regular face.
     */
    get font(): Font | null;
    copyWith(options?: TextStyleOptions): TextStyle;
    /**
     * This style with `other`'s stated fields on top. A non-inheriting `other`
     * replaces this one entirely — that is what `inherit: false` means.
     */
    merge(other: TextStyle | null | undefined): TextStyle;
}
