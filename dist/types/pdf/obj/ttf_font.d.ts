import { PdfFontMetrics } from '../font/font_metrics.ts';
import type { PdfFont } from '../font/font.ts';
import type { PdfFontBitmap } from '../font/font.ts';
import { TtfParser } from '../font/ttf_parser.ts';
import { PdfDict } from '../format/dict.ts';
import type { PdfObjectRegistry } from './object.ts';
export interface PdfTtfFontOptions {
    /**
     * Blank the `/ToUnicode` mapping, so the text renders but cannot be extracted.
     * Upstream's `protect` flag.
     */
    readonly protect?: boolean;
}
export declare class PdfTtfFont implements PdfFont {
    readonly font: TtfParser;
    readonly protect: boolean;
    readonly isComposite = true;
    /**
     * Code points in CID order: `cmap[cid]` is the rune drawn by CID `cid`. CID 0
     * is `.notdef`, as `/Identity-H` requires, so index 0 holds rune 0.
     */
    private readonly cmap;
    private readonly cidByRune;
    constructor(bytes: Uint8Array, { protect }?: PdfTtfFontOptions);
    get fontName(): string;
    get ascent(): number;
    get descent(): number;
    get unitsPerEm(): number;
    /** Whether this font can draw `codePoint` at all. */
    isRuneSupported(codePoint: number): boolean;
    getBitmap(codePoint: number): PdfFontBitmap | null;
    /** Metrics in em units, so the caller scales by the font size. */
    glyphMetrics(codePoint: number): PdfFontMetrics;
    stringMetrics(text: string, size: number, letterSpacing?: number): PdfFontMetrics;
    /**
     * `<0048006500…>` — one two-byte CID per code point, allocated on first use.
     *
     * Iteration is by code point, so an astral character is one CID rather than a
     * surrogate pair, which is what the format 12 `cmap` the parser reads expects.
     */
    encodeText(text: string): string;
    /**
     * The Type0 font dictionary, plus the four objects it references: the subset
     * program, its descriptor, the per-CID widths, and the `/ToUnicode` CMap.
     */
    resourceDict(document: PdfObjectRegistry): PdfDict;
}
