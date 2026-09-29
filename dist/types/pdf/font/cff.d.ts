/** CFF1 charset metadata for full OpenType embedding (ISO 32000-1, 9.7.4.2).
 * The port reads metadata only; it does not interpret or rewrite charstrings.
 */
export declare function cffFontMetadata(bytes: Uint8Array, glyphCount: number): {
    cids: Uint16Array;
    registry: string;
    ordering: string;
    supplement: number;
};
