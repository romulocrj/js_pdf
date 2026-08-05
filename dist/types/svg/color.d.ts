import type { Rgb } from '../pdf/color.ts';
import type { PdfCanvas } from '../pdf/graphics.ts';
import type { SvgParser } from './parser.ts';
export declare class SvgColor {
    readonly color: Rgb | null;
    /** Alpha carried by functional colour syntax; multiplied into paint opacity. */
    readonly opacity: number;
    /** True for an absent attribute: the parent's paint applies. */
    readonly inherit: boolean;
    constructor(color?: Rgb | null, inherit?: boolean, opacity?: number);
    /** Read but not understood — treated as "do not paint". */
    static readonly unknown: SvgColor;
    /** What an SVG paints with when nothing said otherwise. */
    static readonly defaultColor: SvgColor;
    /** `fill="none"`. */
    static readonly none: SvgColor;
    /** No attribute at all. */
    static readonly inherited: SvgColor;
    get isEmpty(): boolean;
    get isNotEmpty(): boolean;
    merge(other: SvgColor): SvgColor;
    setFillColor(canvas: PdfCanvas): void;
    setStrokeColor(canvas: PdfCanvas): void;
    static fromXml(color: string | null | undefined, parser: SvgParser, currentColor?: SvgColor): SvgColor;
    /** `#abc` to `#aabbcc`; the port's colour reader takes six digits only. */
    private static expandHex;
}
