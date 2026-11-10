/** Resolved embedding levels, one per UTF-16 unit, and each paragraph's base level. */
export interface BidiLevels {
    readonly levels: Uint8Array;
    readonly paragraphs: readonly {
        readonly start: number;
        readonly end: number;
        readonly level: number;
    }[];
}
/** The parts of the bundled implementation the port calls. */
export interface UnicodeBidi {
    getEmbeddingLevels(text: string, direction: 'ltr' | 'rtl'): BidiLevels;
    /** UAX #9 L1-L2 over `text[start..end]`: the index ranges to reverse, in order. */
    getReorderSegments(text: string, levels: BidiLevels, start?: number, end?: number): number[][];
    getMirroredCharacter(character: string): string | null;
    getReorderedString(text: string, levels: BidiLevels): string;
}
/**
 * Built once: the factory rebuilds its character tables, so calling it per
 * paragraph parsed them again every time.
 */
export declare function unicodeBidi(): UnicodeBidi;
/** Apply UAX #9 reordering and mirrored-character substitution. */
export declare function reorderUnicodeBidi(input: string, direction: 'ltr' | 'rtl'): string;
