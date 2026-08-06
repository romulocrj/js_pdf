import { Barcode1D } from './barcode_1d.ts';
import type { BarcodeDrawParams } from './barcode_1d.ts';
import type { BarcodeElement } from './barcode_operations.ts';
/** The function codes Code 128 defines for application-specific meaning. */
export declare const BarcodeCode128Fnc: {
    /** FNC1 at the start of a symbol marks it as GS1-128. */
    readonly fnc1: string;
    /** Function 2, available in tables A and B. */
    readonly fnc2: string;
    /** Function 3, available in tables A and B. */
    readonly fnc3: string;
    /** Function 4, available in tables A and B. */
    readonly fnc4: string;
};
/** Construction options for [BarcodeCode128]. */
export interface BarcodeCode128Options {
    readonly useCode128A: boolean;
    readonly useCode128B: boolean;
    readonly useCode128C: boolean;
    readonly isGS1: boolean;
    readonly escapes: boolean;
    readonly keepParenthesis: boolean;
    readonly addSpaceAfterParenthesis: boolean;
}
/**
 * Code 128 barcode, and its GS1-128 application standard.
 *
 * A high-density linear symbology covering all 128 ASCII characters, defined
 * in ISO/IEC 15417:2007. Three code tables encode the same data at different
 * densities; the encoder mixes them to produce the shortest symbol.
 */
export declare class BarcodeCode128 extends Barcode1D {
    readonly useCode128A: boolean;
    readonly useCode128B: boolean;
    readonly useCode128C: boolean;
    readonly escapes: boolean;
    readonly isGS1: boolean;
    readonly keepParenthesis: boolean;
    readonly addSpaceAfterParenthesis: boolean;
    constructor(options: BarcodeCode128Options);
    get charSet(): Iterable<number>;
    get name(): string;
    /**
     * Find the shortest encoding using a mix of tables A, B and C.
     *
     * The walk is backwards, because a switch to table C only pays for itself
     * once four digits are known to follow.
     */
    shortestCode(data: readonly number[]): number[];
    /** Rewrite the data, inserting FNC1 where GS1 parentheses or escapes ask. */
    adaptData(data: string, text?: boolean): string;
    convert(data: string): boolean[];
    makeText(data: string, params: BarcodeDrawParams, lineWidth: number): BarcodeElement[];
    verifyBytes(data: Uint8Array): void;
}
