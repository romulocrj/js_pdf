import type { BarcodeDrawParams } from './barcode_1d.ts';
import type { BarcodeElement } from './barcode_operations.ts';
import { BarcodeEan } from './ean.ts';
/**
 * EAN 8 barcode.
 *
 * The short EAN, for packages an EAN 13 would not fit on.
 */
export declare class BarcodeEan8 extends BarcodeEan {
    /** Draw the '<' and '>' characters in the left and right margins. */
    readonly drawSpacers: boolean;
    constructor(drawSpacers: boolean);
    get name(): string;
    get minLength(): number;
    get maxLength(): number;
    verifyBytes(data: Uint8Array): void;
    convert(data: string): boolean[];
    marginLeft(params: BarcodeDrawParams): number;
    marginRight(params: BarcodeDrawParams): number;
    getHeight(index: number, count: number, params: BarcodeDrawParams): number;
    makeText(data: string, params: BarcodeDrawParams, lineWidth: number): BarcodeElement[];
}
