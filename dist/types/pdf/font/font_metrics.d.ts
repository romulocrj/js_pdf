export interface PdfFontMetricsOptions {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly ascent?: number;
    readonly descent?: number;
    readonly advanceWidth?: number;
    readonly leftBearing?: number;
}
/** Bounding box and advance measurements for a glyph or a string. */
export declare class PdfFontMetrics {
    static readonly zero: PdfFontMetrics;
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly ascent: number;
    readonly descent: number;
    readonly advanceWidth: number;
    readonly leftBearing: number;
    constructor({ left, top, right, bottom, ascent, descent, advanceWidth, leftBearing }: PdfFontMetricsOptions);
    static append(metrics: Iterable<PdfFontMetrics>, letterSpacing?: number): PdfFontMetrics;
    get width(): number;
    get height(): number;
    get maxWidth(): number;
    get maxHeight(): number;
    get effectiveLeft(): number;
    get rightBearing(): number;
    scale(factor: number): PdfFontMetrics;
}
