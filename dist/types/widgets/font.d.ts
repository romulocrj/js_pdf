import type { PdfFont } from '../pdf/font/font.ts';
import type { PdfTtfFontOptions } from '../pdf/obj/ttf_font.ts';
import type { RenderContext } from './widget.ts';
/** The 14 standard faces, upstream's `Type1Fonts` enum. */
export type Type1FontName = 'courier' | 'courierBold' | 'courierBoldOblique' | 'courierOblique' | 'helvetica' | 'helveticaBold' | 'helveticaBoldOblique' | 'helveticaOblique' | 'times' | 'timesBold' | 'timesBoldItalic' | 'timesItalic' | 'symbol' | 'zapfDingbats';
export declare class Font {
    private readonly create;
    private constructor();
    static type1(face: Type1FontName): Font;
    static courier(): Font;
    static courierBold(): Font;
    static courierBoldOblique(): Font;
    static courierOblique(): Font;
    static helvetica(): Font;
    static helveticaBold(): Font;
    static helveticaBoldOblique(): Font;
    static helveticaOblique(): Font;
    static times(): Font;
    static timesBold(): Font;
    static timesBoldItalic(): Font;
    static timesItalic(): Font;
    static symbol(): Font;
    static zapfDingbats(): Font;
    /**
     * A TrueType font from bytes the caller already has. Nothing here reads a
     * file: the host loads the font however it likes and hands over the array.
     */
    static ttf(data: Uint8Array, options?: PdfTtfFontOptions): Font;
    /**
     * Wrap a `PdfFont` that already exists. The port's own addition: it is what
     * lets `DocumentOptions.font`, which predates this file, keep naming a font
     * object directly.
     */
    static fromPdfFont(font: PdfFont): Font;
    /** Build the font object. Callers should go through `getFont` instead. */
    build(): PdfFont;
    /** The `PdfFont` this declaration stands for in `context`'s document. */
    getFont(context: RenderContext): PdfFont;
}
