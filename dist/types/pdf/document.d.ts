import type { PdfDataType } from './format/base.ts';
import type { PdfObjectBase } from './format/object_base.ts';
import { PdfDict } from './format/dict.ts';
import { PdfXrefTable } from './format/xref.ts';
import type { PdfFont } from './font/font.ts';
import { PdfCatalog } from './obj/catalog.ts';
import { PdfInfo } from './obj/info.ts';
import type { DocumentMetadata } from './obj/info.ts';
import { PdfObject } from './obj/object.ts';
import { PdfPage } from './obj/page.ts';
import { PdfPageList } from './obj/page_list.ts';
import type { PageSize } from './page_format.ts';
export type { DocumentMetadata } from './obj/info.ts';
/** One physical page, with its content stream already rendered to operators. */
export interface SerializedPage {
    readonly format: PageSize;
    readonly content: string;
}
/**
 * Owns the objects that make up a file, and writes them.
 *
 * Serial numbers are assigned in creation order, and objects are laid out in
 * serial order, so creation order is what determines the file layout. The
 * catalog is numbered first because it is the document's entry point; the page
 * list gets its serial next even though the catalog needs a reference to it,
 * which works because references are resolved in `prepare()`, after every object
 * exists.
 */
export declare class PdfDocument {
    private serial;
    readonly xref: PdfXrefTable;
    readonly pageList: PdfPageList;
    readonly catalog: PdfCatalog;
    readonly info: PdfInfo;
    /**
     * The document's single font object. Phase 0.3 replaces this with per-page
     * resource registration over a set of fonts.
     */
    readonly fontObject: PdfObject<PdfDict>;
    constructor(metadata: DocumentMetadata, font?: PdfFont);
    get objects(): readonly PdfObjectBase<PdfDataType>[];
    genSerial(): number;
    register(object: PdfObjectBase<PdfDataType>): void;
    /**
     * Append a page. The content stream is created first so it is numbered before
     * the page that references it, keeping the file in dependency order.
     */
    addPage(format: PageSize, content: string): PdfPage;
    save(): Uint8Array;
}
/** Build a document from already-rendered pages and write it. */
export declare function serializePdf(pages: readonly SerializedPage[], metadata: DocumentMetadata, font?: PdfFont): Uint8Array;
