import { Barcode1D } from './barcode_1d.ts';
/**
 * Code 93 barcode.
 *
 * A denser, more secure alphanumeric successor to Code 39, designed by
 * Intermec in 1982 and used mostly by Canada Post.
 */
export declare class BarcodeCode93 extends Barcode1D {
    get charSet(): Iterable<number>;
    get name(): string;
    convert(data: string): boolean[];
}
