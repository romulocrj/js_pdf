import { PdfFontMetrics } from './font_metrics.ts';
import type { PdfFont } from './font.ts';
import { PdfDict } from '../format/dict.ts';
/**
 * AFM advance widths for the standard proportional Type1 fonts, expressed in
 * em units and indexed by the encoded byte. Oblique variants have their own
 * tables because their punctuation metrics differ from the upright faces.
 */
export declare const helveticaWidths: readonly number[];
export declare const helveticaBoldWidths: readonly number[];
export declare const helveticaBoldObliqueWidths: readonly number[];
export declare const helveticaObliqueWidths: readonly number[];
export declare const timesWidths: readonly number[];
export declare const timesBoldWidths: readonly number[];
export declare const timesBoldItalicWidths: readonly number[];
export declare const timesItalicWidths: readonly number[];
export declare const symbolWidths: readonly number[];
export declare const zapfDingbatsWidths: readonly number[];
/** One of the 14 Type1 fonts that every conforming PDF reader provides. */
export declare class PdfType1Font implements PdfFont {
    readonly fontName: string;
    readonly ascent: number;
    readonly descent: number;
    readonly widths: readonly number[];
    readonly missingWidth: number;
    private constructor();
    static courier(): PdfType1Font;
    static courierBold(): PdfType1Font;
    static courierBoldOblique(): PdfType1Font;
    static courierOblique(): PdfType1Font;
    static helvetica(): PdfType1Font;
    static helveticaBold(): PdfType1Font;
    static helveticaBoldOblique(): PdfType1Font;
    static helveticaOblique(): PdfType1Font;
    static times(): PdfType1Font;
    static timesBold(): PdfType1Font;
    static timesBoldItalic(): PdfType1Font;
    static timesItalic(): PdfType1Font;
    static symbol(): PdfType1Font;
    static zapfDingbats(): PdfType1Font;
    glyphMetrics(charCode: number): PdfFontMetrics;
    stringMetrics(text: string, size: number, letterSpacing?: number): PdfFontMetrics;
    encodeText(text: string): string;
    /**
     * PORT GAP: no `/FirstChar`, `/LastChar`, `/Widths` or `/FontDescriptor`.
     * Upstream emits those for PDF 1.5 and up. They are optional for the 14
     * standard fonts, whose metrics every reader already has built in — which is
     * exactly the set this class covers.
     */
    resourceDict(): PdfDict;
}
export declare const defaultPdfFont: PdfFont;
