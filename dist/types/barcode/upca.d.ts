import type { BarcodeDrawParams } from './barcode_1d.ts';
import type { BarcodeElement } from './barcode_operations.ts';
import { BarcodeEan } from './ean.ts';
/**
 * UPC-A barcode.
 *
 * Twelve digits identifying a trade item, the North American ancestor of
 * EAN 13.
 */
export declare class BarcodeUpcA extends BarcodeEan {
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
