import { PdfObjectStream } from './object_stream.ts';
import type { PdfObjectRegistry } from './object.ts';
/**
 * An XML metadata packet attached to the document catalog.
 *
 * Never compressed, matching upstream: a conforming reader has to be able to
 * find this packet by scanning the file for it, without decoding anything, and
 * the PDF/A profiles require the stream to carry no filter at all.
 */
export declare class PdfMetadata extends PdfObjectStream {
    constructor(document: PdfObjectRegistry, metadata: string);
}
