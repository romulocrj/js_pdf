import { PdfDataType } from './base.ts';
import type { PdfStream } from './stream.ts';
/**
 * Serialize a number the way PDF operators expect: no exponent notation, no
 * trailing zeros, and no negative zero.
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
