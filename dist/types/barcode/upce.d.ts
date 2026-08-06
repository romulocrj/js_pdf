import type { BarcodeDrawParams } from './barcode_1d.ts';
import type { BarcodeElement } from './barcode_operations.ts';
import { BarcodeEan } from './ean.ts';
/**
 * UPC-E barcode.
 *
 * A zero-suppressed UPC-A, for packages too small to carry the full twelve
 * digits.
 */
export declare class BarcodeUpcE extends BarcodeEan {
    /** Fall back to UPC-A when the code cannot be suppressed. */
    readonly fallback: boolean;
    constructor(fallback: boolean);
    get name(): string;
    get minLength(): number;
    get maxLength(): number;
    verifyBytes(data: Uint8Array): void;
    /** Shorten a UPC-A code to UPC-E, or throw if it cannot be shortened. */
    upcaToUpce(data: string): string;
    /** Expand a UPC-E code back to the full UPC-A it stands for. */
    upceToUpca(data: string): string;
    convert(data: string): boolean[];
    marginLeft(params: BarcodeDrawParams): number;
    marginRight(params: BarcodeDrawParams): number;
    getHeight(index: number, count: number, params: BarcodeDrawParams): number;
    makeText(data: string, params: BarcodeDrawParams, lineWidth: number): BarcodeElement[];
    normalize(data: string): string;
}
