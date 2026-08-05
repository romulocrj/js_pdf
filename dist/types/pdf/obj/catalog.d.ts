import { PdfDict } from '../format/dict.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';
import type { PdfPageList } from './page_list.ts';
/** The document catalog: the `/Root` the trailer points at. */
export declare class PdfCatalog extends PdfObject<PdfDict> {
    readonly pageList: PdfPageList;
    constructor(document: PdfObjectRegistry, pageList: PdfPageList, objser?: number);
    prepare(): void;
}
