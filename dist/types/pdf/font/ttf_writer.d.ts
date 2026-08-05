import { TtfParser } from './ttf_parser.ts';
export declare class TtfWriter {
    readonly ttf: TtfParser;
    constructor(ttf: TtfParser);
    /**
     * A TrueType file containing the glyphs `chars` maps to, in that order, plus
     * every glyph their composites are built from.
     */
    withChars(chars: readonly number[]): Uint8Array;
    /** The sfnt header, the table directory, and the tables themselves. */
    private writeFile;
}
