import { PdfObjectStream } from './object_stream.ts';
import type { PdfObjectRegistry } from './object.ts';
/**
 * A CMap program for `values`, where `values[code]` is the code point code
 * `code` stands for — or, with `cid`, the CID it selects. `simple` keys the
 * codes as single bytes. `protect` blanks every mapping but `.notdef` to a
 * space, which leaves the text visible on the page but unrecoverable by copy
 * or extraction.
 *
 * Upstream fills its CMap in during `prepare()`, because its font keeps adding
 * code points while pages are still being written. The port renders every page
 * to operators before any object exists, so the list is already final here.
 */
export declare function fontCmap(values: readonly number[], protect?: boolean, cid?: boolean, simple?: boolean, ros?: {
    registry: string;
    ordering: string;
    supplement: number;
}): string;
export declare class PdfUnicodeCmap extends PdfObjectStream {
    constructor(document: PdfObjectRegistry, cmap: readonly number[], protect?: boolean, simple?: boolean);
}
