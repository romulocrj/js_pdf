import type { PdfDict } from '../format/dict.ts';
import type { PdfFontMetrics } from './font_metrics.ts';
/** Common contract for standard fonts now and embedded fonts in phase 1. */
export interface PdfFont {
    readonly fontName: string;
    readonly ascent: number;
    readonly descent: number;
    stringMetrics(text: string, size: number, letterSpacing?: number): PdfFontMetrics;
    encodeText(text: string): string;
    /**
     * The font's own dictionary, which the document wraps in an indirect object.
     *
     * Returns a `PdfDict` rather than a string as of roadmap phase 0.2, because an
     * embedded TTF needs to reference further objects — a font descriptor, a
     * `FontFile2` stream, a `/ToUnicode` CMap — and a reference can only be built
     * from a real object, not spliced into text.
     */
    resourceDict(): PdfDict;
}
