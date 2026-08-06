import type { PdfDataType } from './base.ts';
import { PdfIndirect } from './indirect.ts';
import type { PdfStream } from './stream.ts';
/** Document-wide output options. */
export interface PdfSettings {
    /**
     * Deflate stream data, keeping the result only when it is actually smaller.
     *
     * On by default. Turning it off trades file size for generation time: the
     * compressor is written in JavaScript, so a document dominated by large
     * images pays real milliseconds for a very large saving.
     */
    readonly compress: boolean;
}
export declare const DEFAULT_PDF_SETTINGS: PdfSettings;
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
