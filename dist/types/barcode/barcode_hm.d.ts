import type { BarcodeMakeOptions } from './barcode.ts';
import { Barcode1D } from './barcode_1d.ts';
import type { BarcodeElement } from './barcode_operations.ts';
/**
 * The bar modulation type.
 *
 * The numeric values are load-bearing: `fromBits` reads two bits straight out
 * of the symbol table and uses them as an index, exactly as upstream indexes
 * `BarcodeHMBar.values`.
 */
export declare const BarcodeHMBar: {
    /** No ascender and no descender. */
    readonly tracker: 0;
    /** Ascender only. */
    readonly ascender: 1;
    /** Descender only. */
    readonly descender: 2;
    /** Both ascender and descender. */
    readonly full: 3;
};
export type BarcodeHMBar = (typeof BarcodeHMBar)[keyof typeof BarcodeHMBar];
/** Height-modulated barcode generation class. */
export declare abstract class BarcodeHM extends Barcode1D {
    private readonly trackerRatio;
    constructor(tracker?: number);
    makeBytes(data: Uint8Array, options: BarcodeMakeOptions): BarcodeElement[];
    toHex(data: string): string;
    /** Read two bits as a bar type. */
    fromBits(bits: number): BarcodeHMBar;
    /** Expand a bit-encoded integer into `len` bar types, two bits each. */
    addHW(code: number, len: number): BarcodeHMBar[];
    convert(_data: string): boolean[];
    /** The actual symbology: one modulation per bar. */
    abstract convertHM(data: string): BarcodeHMBar[];
}
