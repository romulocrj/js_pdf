import { PdfDictStream } from '../format/dict_stream.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';
/**
 * An indirect object holding a byte stream — page content operators, embedded
 * font programs, image data.
 *
 * The dictionary and the data are held apart until write time because `/Length`
 * is derived from the data, and because compression is decided there too;
 * `PdfDictStream` joins them.
 *
 * `compress` is where the document's setting reaches an individual stream. It
 * defaults to whatever the document asked for, and a subclass holding data that
 * is already compressed passes `false` instead.
 */
export declare class PdfObjectStream extends PdfObject<PdfDictStream> {
    constructor(document: PdfObjectRegistry, data: Uint8Array, compress?: boolean);
}
