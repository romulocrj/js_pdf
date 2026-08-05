import { PdfObjectStream } from './object_stream.ts';
import type { PdfObjectRegistry } from './object.ts';
/**
 * Upstream fills this in during `prepare()`, because its font keeps adding code
 * points to the map while pages are still being written. The port renders every
 * page to operators before any object exists, so the list is already final here
 * and the stream can be built in the constructor.
 */
export declare function unicodeCmapStream(cmap: readonly number[], protect?: boolean): string;
export declare class PdfUnicodeCmap extends PdfObjectStream {
    constructor(document: PdfObjectRegistry, cmap: readonly number[], protect?: boolean);
}
