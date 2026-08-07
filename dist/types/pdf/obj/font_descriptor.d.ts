import { PdfDict } from '../format/dict.ts';
import type { PdfDictStream } from '../format/dict_stream.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';
export interface PdfFontDescriptorOptions {
    readonly fontName: string;
    /** The embedded font program; becomes `/FontFile2`. */
    readonly file: PdfObject<PdfDictStream>;
    /** 4 = symbolic, 32 = non-symbolic. Upstream picks by composite-ness. */
    readonly flags: number;
    /** `[xMin, yMin, xMax, yMax]`, already scaled to 1000 units per em. */
    readonly fontBBox: readonly [number, number, number, number];
    /** Fractions of an em, as `PdfFont` reports them. */
    readonly ascent: number;
    readonly descent: number;
}
/**
 * Upstream takes the `PdfTtfFont` itself and reads the numbers back off it in
 * `prepare()`. The port passes the numbers, which keeps this module from
 * importing the font that constructs it.
 *
 * UPSTREAM PARITY: `/ItalicAngle`, `/CapHeight` and `/StemV` are upstream's constants
 * (0, 10, 79) rather than measurements. They are required entries that no
 * reader uses when the program is embedded, and deriving them properly means
 * reading `post` and `OS/2`, which is a separate piece of work.
 */
export declare class PdfFontDescriptor extends PdfObject<PdfDict> {
    constructor(document: PdfObjectRegistry, options: PdfFontDescriptorOptions);
}
