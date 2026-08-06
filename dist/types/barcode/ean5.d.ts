import { BarcodeEan2 } from './ean2.ts';
/**
 * EAN 5 barcode.
 *
 * The five-digit supplement to an EAN 13 on a book, carrying a suggested
 * price.
 */
export declare class BarcodeEan5 extends BarcodeEan2 {
    get name(): string;
    get minLength(): number;
    get maxLength(): number;
    checkSumModulo10(data: string): string;
    convert(data: string): boolean[];
}
