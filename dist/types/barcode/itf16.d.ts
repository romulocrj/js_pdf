import type { BarcodeDrawParams } from './barcode_1d.ts';
import type { BarcodeElement } from './barcode_operations.ts';
import { BarcodeItf } from './itf.ts';
/**
 * ITF-16 barcode.
 *
 * The UPC Shipping Container Symbol: sixteen digits, the last a check digit,
 * marking cartons and pallets.
 */
export declare class BarcodeItf16 extends BarcodeItf {
    constructor(drawBorder: boolean, borderWidth: number | null, quietWidth: number | null);
    get name(): string;
    makeText(data: string, params: BarcodeDrawParams, lineWidth: number): BarcodeElement[];
}
