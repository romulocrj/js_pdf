import { Barcode1D } from './barcode_1d.ts';
import type { BarcodeDrawParams } from './barcode_1d.ts';
import type { BarcodeElement } from './barcode_operations.ts';
/**
 * Code 39 barcode.
 *
 * 43 characters: A-Z, 0-9 and `- . $ / + %` and space. A 44th, `*`, delimits
 * the symbol at both ends; [drawSpacers] decides whether it is also printed.
 */
export declare class BarcodeCode39 extends Barcode1D {
    readonly drawSpacers: boolean;
    constructor(drawSpacers: boolean);
    get charSet(): Iterable<number>;
    get name(): string;
    convert(data: string): boolean[];
    makeText(data: string, params: BarcodeDrawParams, lineWidth: number): BarcodeElement[];
}
