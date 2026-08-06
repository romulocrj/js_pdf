import type { BarcodeDrawParams } from './barcode_1d.ts';
import type { BarcodeElement } from './barcode_operations.ts';
import { BarcodeEan } from './ean.ts';
/**
 * EAN 2 barcode.
 *
 * A supplement to EAN 13 and UPC-A, printed on magazines to carry the issue
 * number.
 */
export declare class BarcodeEan2 extends BarcodeEan {
    get name(): string;
    get minLength(): number;
    get maxLength(): number;
    convert(data: string): boolean[];
    marginTop(params: BarcodeDrawParams): number;
    getHeight(_index: number, _count: number, params: BarcodeDrawParams): number;
    makeText(data: string, params: BarcodeDrawParams, _lineWidth: number): BarcodeElement[];
    normalize(data: string): string;
}
