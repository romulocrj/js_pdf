import { PdfObjectStream } from './object_stream.ts';
import type { PdfObjectRegistry } from './object.ts';
/** Binary or graphic stream that can be named from a page's `/XObject` map. */
export declare class PdfXObject extends PdfObjectStream {
    constructor(document: PdfObjectRegistry, subtype: string | null, data?: Uint8Array<ArrayBuffer>);
    get name(): string;
}
