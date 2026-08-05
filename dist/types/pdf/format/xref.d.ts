import { PdfDict } from './dict.ts';
import type { PdfDataType } from './base.ts';
import type { PdfObjectBase } from './object_base.ts';
import type { PdfStream } from './stream.ts';
/**
 * The file writer: header, every object, the cross-reference table, trailer.
 *
 * `params` is the trailer dictionary. The document fills `/Size`, `/Root` and
 * `/Info` — in that order, which is the order they are emitted.
 */
export declare class PdfXrefTable {
    readonly params: PdfDict;
    readonly objects: PdfObjectBase<PdfDataType>[];
    add(object: PdfObjectBase<PdfDataType>): void;
    private writeBlock;
    output(s: PdfStream): void;
}
