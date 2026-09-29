/**
 * Page dimensions in PDF points (1/72 inch), and the margins the format brings
 * with it — upstream `PdfPageFormat` carries both, and a page with no margin of
 * its own takes the format's.
 */
export interface PageSize {
    readonly width: number;
    readonly height: number;
    readonly marginTop?: number;
    readonly marginRight?: number;
    readonly marginBottom?: number;
    readonly marginLeft?: number;
}
/** Infinite dimensions are fitted to the body by Page; MultiPage needs finite paper. */
export declare const PageFormat: Readonly<{
    A3: PageSize;
    A4: PageSize;
    A5: PageSize;
    A6: PageSize;
    LETTER: PageSize;
    LEGAL: PageSize;
    ROLL57: PageSize;
    ROLL80: PageSize;
    UNDEFINED: PageSize;
    STANDARD: PageSize;
}>;
/**
 * The margin a page falls back to when neither it nor its format states one.
 * Upstream has no such value — a `PdfPageFormat` always carries margins — so
 * this covers the port's bare `{ width, height }` formats alone.
 */
export declare const DEFAULT_MARGIN = 40;
/** The margins a format declares, or `null` when it declares none. */
export declare function formatMargin(format: PageSize): {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
} | null;
/**
 * One physical unit in PDF points. Upstream holds these as statics on
 * `PdfPageFormat`; SVG needs them because a length may be written `10mm`.
 */
export declare const PageUnit: Readonly<{
    point: 1;
    inch: 72;
    cm: number;
    mm: number;
    pica: 12;
    dp: number;
}>;
/** Upstream value-class spelling; existing PageFormat objects remain supported. */
export declare class PdfPageFormat implements PageSize {
    readonly width: number;
    readonly height: number;
    readonly marginTop: number;
    readonly marginRight: number;
    readonly marginBottom: number;
    readonly marginLeft: number;
    constructor(width: number, height: number, options?: Omit<PageSize, 'width' | 'height'> & {
        readonly marginAll?: number;
    });
    static readonly a3: PdfPageFormat;
    static readonly a4: PdfPageFormat;
    static readonly a5: PdfPageFormat;
    static readonly a6: PdfPageFormat;
    static readonly letter: PdfPageFormat;
    static readonly legal: PdfPageFormat;
    static readonly roll57: PdfPageFormat;
    static readonly roll80: PdfPageFormat;
    static readonly undefined: PdfPageFormat;
    static readonly standard: PdfPageFormat;
    static readonly point: 1;
    static readonly inch: 72;
    static readonly cm: number;
    static readonly mm: number;
    static readonly dp: number;
    copyWith(values?: Partial<PageSize>): PdfPageFormat;
    get dimension(): {
        x: number;
        y: number;
    };
    get availableWidth(): number;
    get availableHeight(): number;
    get availableDimension(): {
        x: number;
        y: number;
    };
    get landscape(): PdfPageFormat;
    get portrait(): PdfPageFormat;
    applyMargin({ left, top, right, bottom }: {
        left: number;
        top: number;
        right: number;
        bottom: number;
    }): PdfPageFormat;
    equals(other: unknown): boolean;
    get hashCode(): number;
    toString(): string;
}
