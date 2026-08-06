import type { BarcodeDrawParams } from './barcode_1d.ts';
import type { BarcodeElement } from './barcode_operations.ts';
import { BarcodeItf } from './itf.ts';
/**
 * ITF-14 barcode.
 *
 * GS1's Interleaved 2 of 5 for a Global Trade Item Number, printed on the
 * outer packaging of a product. Always fourteen digits.
 */
export declare class BarcodeItf14 extends BarcodeItf {
    constructor(drawBorder: boolean, borderWidth: number | null, quietWidth: number | null);
    get name(): string;
    makeText(data: string, params: BarcodeDrawParams, lineWidth: number): BarcodeElement[];
}
