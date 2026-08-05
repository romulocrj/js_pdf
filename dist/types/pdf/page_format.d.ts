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
