import { PdfDataType } from './base.ts';
import type { PdfStream } from './stream.ts';
/**
 * A reference to an indirect object — `12 0 R`. Obtained from
 * `PdfObjectBase.ref()`, never constructed by hand, so a reference cannot name
 * an object the document does not own.
 */
export declare class PdfIndirect extends PdfDataType {
    readonly ser: number;
    readonly gen: number;
    constructor(ser: number, gen: number);
    equals(other: PdfIndirect): boolean;
    output(s: PdfStream): void;
}
