import type { PdfDataType } from './base.ts';
import { PdfIndirect } from './indirect.ts';
import type { PdfStream } from './stream.ts';
import type { PdfaAttachedFileOptions } from '../obj/pdfa/pdfa_attached_files.ts';
/**
 * PDF/A output, already validated by `Document`; see its `pdfa` option. Only
 * parts 2 and 3 and levels B and U: part 1 forbids the transparency the port
 * paints, and level A needs a structure tree the port does not write.
 */
export interface PdfaSettings {
    readonly part: 2 | 3;
    readonly conformance: 'B' | 'U';
    /** The ICC profile of the `/OutputIntents` entry. */
    readonly colorProfile: Uint8Array;
    readonly outputCondition?: string;
    /** PDF/A-3 only. */
    readonly attachments?: readonly PdfaAttachedFileOptions[];
    /** RDF inserted into the generated XMP packet, such as `PdfaFacturxRdf().create()`. */
    readonly extensionRdf?: string;
}
/** Document-wide output options. */
export interface PdfSettings {
    readonly simpleTrueTypeFonts?: boolean;
    /**
     * Deflate stream data, keeping the result only when it is actually smaller.
     *
     * On by default. Turning it off trades file size for generation time: the
     * compressor is written in JavaScript, so a document dominated by large
     * images pays real milliseconds for a very large saving.
     */
    readonly compress: boolean;
    /**
     * Paint a `PdfColor`'s alpha as constant alpha; on unless `false`. Pages
     * read it when they create their canvas — see `PdfCanvasOptions`.
     */
    readonly colorAlpha?: boolean;
    /** Write PDF/A: output intent, XMP, `/ID`, checks. Absent, nothing changes. */
    readonly pdfa?: PdfaSettings;
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
