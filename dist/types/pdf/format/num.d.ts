import { PdfDataType } from './base.ts';
import type { PdfStream } from './stream.ts';
/**
 * Serialize a number the way PDF operators expect: no exponent notation, no
 * trailing zeros, and no negative zero.
 *
 * ISO 32000-1 7.3.3 has syntax for none of `NaN`, `Infinity` or an exponent,
 * and a reader drops the whole operator or dictionary entry that holds one. As
 * upstream #1980 does, a non-finite value writes `0` and anything from 1e21 up
 * (where the built-in conversion switches to exponents) writes plain integer
 * digits, clamped to `LIMIT`. Every finite value below 1e21 is unchanged.
 */
export declare function formatNumber(value: number): string;
/** A PDF numeric object. */
export declare class PdfNum extends PdfDataType {
    readonly value: number;
    constructor(value: number);
    output(s: PdfStream): void;
}
/**
 * A bare run of space-separated numbers — the operand form used inside content
 * streams and by matrix-valued dictionary entries. Not an array: it emits no
 * brackets.
 */
export declare class PdfNumList extends PdfDataType {
    readonly values: readonly number[];
    constructor(values: readonly number[]);
    output(s: PdfStream): void;
}
