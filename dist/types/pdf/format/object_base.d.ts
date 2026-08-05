import type { PdfDataType } from './base.ts';
import { PdfIndirect } from './indirect.ts';
import type { PdfStream } from './stream.ts';
/**
 * An indirect object: a serial number plus the value it wraps.
 *
 * `params` is the wrapped value — a dictionary for most objects, a stream
 * dictionary for content. `prepare()` is the hook where an object fills in
 * entries that depend on the rest of the document, such as a page's `/Parent`;
 * it runs after every object exists, so forward references resolve.
 */
export declare class PdfObjectBase<T extends PdfDataType> {
    readonly objser: number;
    readonly objgen: number;
    readonly params: T;
    constructor(objser: number, params: T, objgen?: number);
    /** A reference to this object, for use as a dictionary or array value. */
    ref(): PdfIndirect;
    /** Called once before serialization, after all objects have been created. */
    prepare(): void;
    /** Write `n g obj … endobj` and return the offset this object started at. */
    output(s: PdfStream): number;
    protected writeContent(s: PdfStream): void;
}
