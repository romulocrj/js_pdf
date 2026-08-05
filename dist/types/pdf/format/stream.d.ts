/**
 * Growable byte buffer, the sink every `PdfDataType` writes into.
 *
 * `offset` is the running length and is what the cross-reference table records
 * as an object's position, so it must never be rewound.
 */
export declare class PdfStream {
    private buffer;
    private length;
    /** Bytes written so far — an object's offset in the file. */
    get offset(): number;
    private ensure;
    putByte(byte: number): void;
    putBytes(bytes: Uint8Array): void;
    /** Append a string whose code units are all byte values. */
    putString(value: string): void;
    /** The bytes written, as a copy the caller owns. */
    output(): Uint8Array;
}
/**
 * Encode a string where every code unit is already a byte value (0..255).
 * PDF syntax and content streams are Latin-1 by construction.
 */
export declare function encodeLatin1(value: string): Uint8Array;
