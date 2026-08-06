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
/**
 * Only the two formats the port currently exercises are present; the upstream
 * `PdfPageFormat` carries the full ISO/US set plus marginless variants. The
 * margins are upstream's: 2 cm on ISO paper, one inch on US paper.
 */
export declare const PageFormat: Readonly<Record<'A4' | 'LETTER', PageSize>>;
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
}>;
