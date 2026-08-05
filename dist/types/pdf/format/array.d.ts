import { PdfDataType } from './base.ts';
import type { PdfIndirect } from './indirect.ts';
import type { PdfStream } from './stream.ts';
/**
 * Anything that can hand out a reference to itself. Declared structurally so
 * `format/` never has to import `obj/`, keeping the import direction one-way.
 */
export interface PdfReferenceable {
    ref(): PdfIndirect;
}
export declare class PdfArray extends PdfDataType {
    readonly values: PdfDataType[];
    constructor(values?: readonly PdfDataType[]);
    /** `[0 0 595.2756 841.8898]` — the `/MediaBox` and `/FontBBox` shape. */
    static fromNum(values: readonly number[]): PdfArray;
    /** `[5 0 R 9 0 R]` — the `/Kids` and `/Contents` shape. */
    static fromObjects(objects: readonly PdfReferenceable[]): PdfArray;
    get length(): number;
    add(value: PdfDataType): void;
    output(s: PdfStream): void;
}
