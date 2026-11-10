import { PdfArray } from '../../format/array.ts';
import { PdfDict } from '../../format/dict.ts';
import { PdfObject } from '../object.ts';
import type { PdfObjectRegistry } from '../object.ts';
import type { PdfCatalog } from '../catalog.ts';
/** How an attachment relates to the document (ISO 19005-3 Annex E, `/AFRelationship`). */
export type PdfaRelationship = 'Data' | 'Source' | 'Alternative' | 'Supplement' | 'Unspecified';
export interface PdfaAttachedFileOptions {
    readonly name: string;
    /** A string is embedded as UTF-8. */
    readonly data: string | Uint8Array;
    /** The MIME type written as `/Subtype`; `text/xml` by default, as upstream. */
    readonly mimeType?: string;
    /** `Alternative` by default, as upstream. */
    readonly relationship?: PdfaRelationship;
    readonly description?: string | null;
    /** `/Params /ModDate`; the document's creation date when omitted. */
    readonly modificationDate?: Date | null;
}
/** One validated attachment, with its payload already encoded. */
export declare class PdfaAttachedFile {
    readonly name: string;
    readonly data: Uint8Array;
    readonly mimeType: string;
    readonly relationship: PdfaRelationship;
    readonly description: string | null;
    readonly modificationDate: Date | null;
    constructor({ name, data, mimeType, relationship, description, modificationDate }: PdfaAttachedFileOptions);
}
/** The embedded files of a PDF/A-3 document; registers itself on the catalog. */
export declare class PdfaAttachedFiles {
    readonly files: readonly PdfaAttachedFile[];
    private readonly specs;
    /** The `/EmbeddedFiles` name tree. */
    readonly names: PdfObject<PdfDict>;
    constructor(document: PdfObjectRegistry & {
        readonly catalog: PdfCatalog;
    }, files: readonly (PdfaAttachedFile | PdfaAttachedFileOptions)[], date?: Date);
    get isNotEmpty(): boolean;
    catalogNames(): PdfDict;
    catalogAF(): PdfArray;
}
