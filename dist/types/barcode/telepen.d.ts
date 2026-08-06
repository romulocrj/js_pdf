import { Barcode1D } from './barcode_1d.ts';
/**
 * Telepen barcode.
 *
 * A 1972 British design that expresses all 128 ASCII characters with only two
 * bar widths and no shift characters.
 */
export declare class BarcodeTelepen extends Barcode1D {
    get charSet(): Iterable<number>;
    get name(): string;
    convert(data: string): boolean[];
}
