import type { BarcodeDrawParams } from './barcode_1d.ts';
import type { BarcodeElement } from './barcode_operations.ts';
import { BarcodeEan13 } from './ean13.ts';
/**
 * ISBN barcode.
 *
 * An EAN 13 whose number is also spelled out, hyphenated, above the bars.
 */
export declare class BarcodeIsbn extends BarcodeEan13 {
    /** Draw the ISBN number as text above the barcode. */
    readonly drawIsbn: boolean;
    constructor(drawEndChar: boolean, drawIsbn: boolean);
    get name(): string;
    marginTop(params: BarcodeDrawParams): number;
    makeText(data: string, params: BarcodeDrawParams, lineWidth: number): BarcodeElement[];
}
