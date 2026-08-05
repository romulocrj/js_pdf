/** Page dimensions in PDF points (1/72 inch). */
export interface PageSize {
    readonly width: number;
    readonly height: number;
}
/**
 * Only the two formats the port currently exercises are present; the upstream
 * `PdfPageFormat` carries the full ISO/US set plus marginless variants.
 */
export declare const PageFormat: Readonly<Record<'A4' | 'LETTER', PageSize>>;
export declare const DEFAULT_MARGIN = 40;
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
