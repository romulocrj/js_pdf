import { PdfDict } from '../format/dict.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';
import type { PdfPageList } from './page_list.ts';
import type { PdfNames } from './names.ts';
import type { PdfOutline } from './outline.ts';
/** The document catalog: the `/Root` the trailer points at. */
export declare class PdfCatalog extends PdfObject<PdfDict> {
    readonly pageList: PdfPageList;
    names: PdfNames | null;
    outline: PdfOutline | null;
    showOutlines: boolean;
    constructor(document: PdfObjectRegistry, pageList: PdfPageList, objser?: number);
    prepare(): void;
}
