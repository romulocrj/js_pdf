import { PdfDict } from '../format/dict.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';
export interface DocumentMetadata {
    readonly title?: string | null;
    readonly author?: string | null;
    readonly subject?: string | null;
    readonly creator?: string | null;
    readonly producer?: string | null;
    readonly keywords?: string | null;
    readonly xmpMetadata?: string | null;
}
/** The `/Info` dictionary the trailer points at. */
export declare class PdfInfo extends PdfObject<PdfDict> {
    constructor(document: PdfObjectRegistry, metadata: DocumentMetadata);
}
