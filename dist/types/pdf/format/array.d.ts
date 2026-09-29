import type { ColorInput } from '../color.ts';
import { PdfDataType } from './base.ts';
import { PdfIndirect } from './indirect.ts';
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
    static fromColor(color: ColorInput): PdfArray;
    get length(): number;
    /** Preserve upstream value equality for scalar entries and indirect references. */
    uniq(): void;
    add(value: PdfDataType): void;
    output(s: PdfStream): void;
}
