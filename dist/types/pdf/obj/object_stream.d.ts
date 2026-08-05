import { PdfDictStream } from '../format/dict_stream.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';
/**
 * An indirect object holding a byte stream — a page's content operators today,
 * embedded font programs and image data later.
 *
 * The dictionary and the data are held apart until write time because `/Length`
 * is derived from the data; `PdfDictStream` joins them.
 */
export declare class PdfObjectStream extends PdfObject<PdfDictStream> {
    constructor(document: PdfObjectRegistry, data: Uint8Array);
}
