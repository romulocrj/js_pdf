import type { PdfDataType } from '../format/base.ts';
import { PdfDict } from '../format/dict.ts';
import { PdfObjectBase } from '../format/object_base.ts';
import type { PdfSettings } from '../format/object_base.ts';
/**
 * The document side of an indirect object. Registering with the document is the
 * constructor's job, exactly as upstream: an object that exists is an object
 * that gets written, so there is no way to hand out a reference to something
 * the file will not contain.
 *
 * `PdfDocument` is taken structurally rather than imported to keep the import
 * direction one-way — `document.ts` owns the concrete registry.
 */
export interface PdfObjectRegistry {
    genSerial(): number;
    register(object: PdfObjectBase<PdfDataType>): void;
    /** Document-wide output options; streams read `compress` from here. */
    readonly settings: PdfSettings;
}
export declare class PdfObject<T extends PdfDataType> extends PdfObjectBase<T> {
    constructor(document: PdfObjectRegistry, params: T, objser?: number);
}
/** An indirect object wrapping a dictionary — the common case. */
export declare class PdfObjectDict extends PdfObject<PdfDict> {
    constructor(document: PdfObjectRegistry, type?: string, objser?: number);
}
