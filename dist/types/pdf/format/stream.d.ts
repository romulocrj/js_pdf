/**
 * Encode a string where every code unit is already a byte value (0..255).
 * PDF syntax and content streams are Latin-1 by construction.
 */
export declare function encodeLatin1(value: string): Uint8Array;
export declare function concatBytes(chunks: readonly Uint8Array[]): Uint8Array;
