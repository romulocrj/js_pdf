import type { PdfDataType } from './base.ts';
import { PdfDict } from './dict.ts';
import type { PdfStream } from './stream.ts';
/** A stream object: a dictionary describing bytes, followed by those bytes. */
export declare class PdfDictStream extends PdfDict {
    data: Uint8Array;
    constructor(data?: Uint8Array, values?: Iterable<readonly [string, PdfDataType]>);
    output(s: PdfStream): void;
}
