import { Barcode } from './barcode.ts';
import type { BarcodeMakeOptions } from './barcode.ts';
import type { BarcodeElement } from './barcode_operations.ts';
/** The raw module matrix of a 2D barcode. */
export declare class Barcode2DMatrix {
    readonly width: number;
    readonly height: number;
    /** The module aspect ratio (width over height). */
    readonly ratio: number;
    readonly pixels: readonly boolean[];
    constructor(width: number, height: number, ratio: number, pixels: readonly boolean[]);
    /** Build a matrix by asking a callback about each module. */
    static fromXY(width: number, height: number, ratio: number, isDark: (x: number, y: number) => boolean): Barcode2DMatrix;
}
/** Two-dimensional barcode generation class. */
export declare abstract class Barcode2D extends Barcode {
    makeBytes(data: Uint8Array, options: BarcodeMakeOptions): BarcodeElement[];
    verifyBytes(data: Uint8Array): void;
    /** A hexadecimal digest of the modules, for comparing against upstream. */
    toHex(data: string): string;
    /** The actual symbology: which modules are dark. */
    abstract convert(data: Uint8Array): Barcode2DMatrix;
}
