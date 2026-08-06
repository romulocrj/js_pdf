import type { BarcodeMakeOptions } from './barcode.ts';
import type { BarcodeDrawParams } from './barcode_1d.ts';
import type { BarcodeElement } from './barcode_operations.ts';
import { BarcodeEan } from './ean.ts';
/**
 * Interleaved 2 of 5 barcode.
 *
 * A continuous two-width symbology for digits, encoding one digit in the bars
 * and the next in the spaces between them.
 */
export declare class BarcodeItf extends BarcodeEan {
    /** Append a modulo 10 check digit. */
    readonly addChecksum: boolean;
    /** Prepend a '0' when the length is not even. */
    readonly zeroPrepend: boolean;
    /** Draw a black border around the barcode. */
    readonly drawBorder: boolean;
    /** Width of that border. */
    readonly borderWidth: number | null;
    /** Width of the quiet zone inside the border. */
    readonly quietWidth: number | null;
    /** The barcode length, when it is fixed. */
    readonly fixedLength: number | null;
    constructor(addChecksum: boolean, zeroPrepend: boolean, drawBorder: boolean, borderWidth: number | null, quietWidth: number | null, fixedLength: number | null);
    get name(): string;
    get minLength(): number;
    get maxLength(): number;
    private getBorderWidth;
    private getQuietWidth;
    marginTop(params: BarcodeDrawParams): number;
    marginLeft(params: BarcodeDrawParams): number;
    marginRight(params: BarcodeDrawParams): number;
    getHeight(index: number, count: number, params: BarcodeDrawParams): number;
    /** The data with the padding and check digit the options ask for. */
    private padded;
    convert(data: string): boolean[];
    makeBytes(data: Uint8Array, options: BarcodeMakeOptions): BarcodeElement[];
    makeText(data: string, params: BarcodeDrawParams, lineWidth: number): BarcodeElement[];
    verifyBytes(data: Uint8Array): void;
    normalize(data: string): string;
}
