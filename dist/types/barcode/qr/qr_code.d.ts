/** QR error correction levels, in the numbering the format information uses. */
export declare const QrErrorCorrectLevel: {
    readonly L: 1;
    readonly M: 0;
    readonly Q: 3;
    readonly H: 2;
};
/**
 * The levels ordered from least to most correction, which is the order the
 * public `BarcodeQRCorrectionLevel` indexes.
 */
export declare const QR_ERROR_CORRECT_LEVELS: readonly number[];
/** Encoding modes. */
export declare const QrMode: {
    readonly number: number;
    readonly alphaNum: number;
    readonly byte8bit: number;
    readonly kanji: number;
};
/** Raised when the data will not fit the requested QR version. */
export declare class InputTooLongError extends Error {
    constructor(providedInput: number, inputLimit: number);
}
/** A growable bit string, written most significant bit first. */
export declare class QrBitBuffer {
    private readonly buffer;
    private bitLength;
    get length(): number;
    getByte(index: number): number;
    put(value: number, length: number): void;
    putBit(bit: boolean): void;
}
/** One Reed-Solomon block of a QR symbol. */
export interface QrRsBlock {
    readonly totalCount: number;
    readonly dataCount: number;
}
/** A QR symbol: its version, correction level, and the data it carries. */
export declare class QrCode {
    readonly typeNumber: number;
    readonly errorCorrectLevel: number;
    readonly moduleCount: number;
    private readonly dataList;
    private cache;
    constructor(typeNumber: number, errorCorrectLevel: number);
    /** The smallest version that fits the data at the given correction level. */
    static fromBytes(data: Uint8Array, errorCorrectLevel: number): QrCode;
    addByteData(data: Uint8Array): void;
    /** The interleaved data and error correction codewords. */
    get dataCache(): number[];
}
