import type { BarcodeDrawParams } from './barcode_1d.ts';
import type { BarcodeElement } from './barcode_operations.ts';
import { BarcodeEan } from './ean.ts';
/**
 * EAN 13 barcode.
 *
 * The International Article Number: the retail product identifier used in
 * global trade.
 */
export declare class BarcodeEan13 extends BarcodeEan {
    /** Draw the end character '>' in the right margin. */
    readonly drawEndChar: boolean;
    constructor(drawEndChar: boolean);
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
