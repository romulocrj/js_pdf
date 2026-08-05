import type { PdfFontMetrics } from './font_metrics.ts';
/** Common contract for standard fonts now and embedded fonts in phase 1. */
export interface PdfFont {
    readonly fontName: string;
    readonly ascent: number;
    readonly descent: number;
    stringMetrics(text: string, size: number, letterSpacing?: number): PdfFontMetrics;
    encodeText(text: string): string;
    resourceDict(): string;
}
