import { Barcode1D } from './barcode_1d.ts';
/**
 * The common half of the EAN/UPC family: fixed lengths and check digits.
 *
 * ITF inherits from this too, for the modulo 10 checksum alone.
 */
export declare abstract class BarcodeEan extends Barcode1D {
    get charSet(): Iterable<number>;
    /**
     * Check the length and verify the check digit; if the check digit was
     * omitted, compute and append it.
     */
    checkLength(data: string, length: number): string;
    /** The modulo 10 check digit. */
    checkSumModulo10(data: string): string;
    /** The modulo 11 check digit. */
    checkSumModulo11(data: string): string;
    /** The data padded to length and given its correct check digit. */
    normalize(data: string): string;
}
