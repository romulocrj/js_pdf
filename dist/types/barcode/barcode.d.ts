import type { BarcodeElement } from './barcode_operations.ts';
/** Supported barcode types. */
export type BarcodeType = 'CodeITF16' | 'CodeITF14' | 'CodeEAN13' | 'CodeEAN8' | 'CodeEAN5' | 'CodeEAN2' | 'CodeISBN' | 'Code39' | 'Code93' | 'CodeUPCA' | 'CodeUPCE' | 'Code128' | 'GS128' | 'Telepen' | 'QrCode' | 'Codabar' | 'PDF417' | 'DataMatrix' | 'Aztec' | 'Rm4scc' | 'Postnet' | 'Itf';
/** Options accepted by [Barcode.make] and [Barcode.makeBytes]. */
export interface BarcodeMakeOptions {
    readonly width: number;
    readonly height: number;
    readonly drawText?: boolean;
    readonly fontHeight?: number | null;
    readonly textPadding?: number | null;
}
/** Options accepted by [Barcode.toSvg]. */
export interface BarcodeSvgOptions {
    readonly x?: number;
    readonly y?: number;
    readonly width?: number;
    readonly height?: number;
    readonly drawText?: boolean;
    readonly fontFamily?: string;
    readonly fontHeight?: number | null;
    readonly textPadding?: number | null;
    readonly color?: number;
    readonly fullSvg?: boolean;
    readonly baseline?: number;
}
/** Barcode generation class. */
export declare abstract class Barcode {
    /**
     * Produce the barcode graphic description: the drawing operations required
     * to display the barcode for a string.
     */
    make(data: string, options: BarcodeMakeOptions): BarcodeElement[];
    /** As [make], but taking bytes the caller already has. */
    abstract makeBytes(data: Uint8Array, options: BarcodeMakeOptions): BarcodeElement[];
    /** Whether this barcode can encode the data. */
    isValid(data: string): boolean;
    /** Whether this barcode can encode the bytes. */
    isValidBytes(data: Uint8Array): boolean;
    /** Throws a [BarcodeException] naming the reason the data cannot be encoded. */
    verify(data: string): void;
    /** Throws a [BarcodeException] naming the reason the bytes cannot be encoded. */
    verifyBytes(data: Uint8Array): void;
    /** Render this barcode to an SVG document, from string data. */
    toSvg(data: string, options?: BarcodeSvgOptions): string;
    /** Render this barcode to an SVG document, from bytes. */
    toSvgBytes(data: Uint8Array, options?: BarcodeSvgOptions): string;
    /** The code points this barcode accepts. */
    abstract get charSet(): Iterable<number>;
    /** The name of this barcode. */
    abstract get name(): string;
    /** The greatest number of characters this barcode can encode. */
    get maxLength(): number;
    /** The least number of characters this barcode can encode. */
    get minLength(): number;
    toString(): string;
}
