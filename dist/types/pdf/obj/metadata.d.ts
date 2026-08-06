import { PdfObjectStream } from './object_stream.ts';
import type { PdfObjectRegistry } from './object.ts';
/** An XML metadata packet attached to the document catalog. */
export declare class PdfMetadata extends PdfObjectStream {
    constructor(document: PdfObjectRegistry, metadata: string);
}
