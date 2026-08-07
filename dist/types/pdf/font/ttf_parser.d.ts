import { PdfFontMetrics } from './font_metrics.ts';
/** `name` table name IDs, upstream's `TtfParserName` enum. */
export declare const TtfParserName: Readonly<{
    copyright: 0;
    fontFamily: 1;
    fontSubfamily: 2;
    uniqueID: 3;
    fullName: 4;
    version: 5;
    postScriptName: 6;
    trademark: 7;
    manufacturer: 8;
    designer: 9;
    description: 10;
    manufacturerURL: 11;
    designerURL: 12;
    license: 13;
    licenseURL: 14;
    reserved: 15;
    preferredFamily: 16;
    preferredSubfamily: 17;
    compatibleFullName: 18;
    sampleText: 19;
    postScriptFindFontName: 20;
    wwsFamily: 21;
    wwsSubfamily: 22;
}>;
export declare const TtfTable: Readonly<{
    head: "head";
    name: "name";
    hmtx: "hmtx";
    hhea: "hhea";
    cmap: "cmap";
    maxp: "maxp";
    loca: "loca";
    glyf: "glyf";
    post: "post";
    os2: "OS/2";
    cff: "CFF ";
    cblc: "CBLC";
    cbdt: "CBDT";
}>;
/** One glyph's program, plus the glyphs a composite glyph refers to. */
export interface TtfGlyphInfo {
    readonly index: number;
    readonly data: Uint8Array;
    readonly compounds: readonly number[];
}
/** A PNG bitmap glyph and the strike metrics needed to align it with text. */
export declare class TtfBitmapInfo {
    readonly data: Uint8Array;
    readonly height: number;
    readonly width: number;
    readonly horizontalBearingX: number;
    readonly horizontalBearingY: number;
    readonly horizontalAdvance: number;
    readonly ascent: number;
    readonly descent: number;
    constructor(data: Uint8Array, height: number, width: number, horizontalBearingX: number, horizontalBearingY: number, horizontalAdvance: number, ascent: number, descent: number);
    get metrics(): PdfFontMetrics;
}
export declare class TtfParser {
    readonly bytes: Uint8Array;
    private readonly view;
    readonly tableOffsets: Map<string, number>;
    readonly tableSize: Map<string, number>;
    /** Codepoint to glyph index, built from every `cmap` subtable understood. */
    readonly charToGlyphIndexMap: Map<number, number>;
    readonly glyphOffsets: number[];
    readonly glyphSizes: number[];
    readonly glyphInfoMap: Map<number, PdfFontMetrics>;
    readonly bitmapInfoMap: Map<number, TtfBitmapInfo>;
    constructor(bytes: Uint8Array);
    /** A four-byte ASCII table tag. */
    private readTag;
    private tableOffset;
    get unitsPerEm(): number;
    get xMin(): number;
    get yMin(): number;
    get xMax(): number;
    get yMax(): number;
    get indexToLocFormat(): number;
    get ascent(): number;
    get descent(): number;
    get lineGap(): number;
    get numOfLongHorMetrics(): number;
    get numGlyphs(): number;
    /** The PostScript name, which is what `/BaseFont` gets in phase 1.3. */
    get fontName(): string;
    get unicode(): boolean;
    /**
     * True for an OpenType font with PostScript outlines. Those have no
     * `glyf`/`loca` to subset, so phase 1.2 has to embed them whole.
     */
    get hasCff(): boolean;
    get isBitmap(): boolean;
    getBitmap(codePoint: number): TtfBitmapInfo | null;
    /** https://developer.apple.com/fonts/TrueType-Reference-Manual/RM06/Chap6name.html */
    getNameID(nameID: number): string | null;
    private parseCMap;
    private parseCMapFormat0;
    private parseCMapFormat4;
    private parseCMapFormat6;
    private parseCMapFormat12;
    /**
     * `loca` holds `numGlyphs + 1` offsets into `glyf`; each glyph's size is the
     * gap to the next one, and a zero-length gap means a blank glyph such as
     * space.
     */
    private parseIndexes;
    /**
     * Per-glyph metrics, normalized to em units so a caller never divides by
     * `unitsPerEm` again.
     *
     * `top` takes `yMin` and `bottom` takes `yMax`, which reads inverted and is
     * upstream's assignment: `PdfFontMetrics` is in PDF space, where y grows
     * upward.
     *
     * https://developer.apple.com/fonts/TrueType-Reference-Manual/RM06/Chap6glyf.html
     */
    private parseGlyphs;
    /**
     * The raw glyph program, sliced out of `glyf` — this is what phase 1.2 copies
     * into a subset. A composite glyph reports the glyphs it is built from, which
     * the subset has to pull in as well.
     *
     * http://stevehanov.ca/blog/?id=143
     */
    readGlyph(index: number): TtfGlyphInfo;
    private readSimpleGlyph;
    private readCompoundGlyph;
    /** Parse PNG-backed bitmap strikes, matching upstream's CBLC format-1 path. */
    private parseBitmaps;
}
