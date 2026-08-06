import { PdfDict } from '../format/dict.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';
import type { PdfPageList } from './page_list.ts';
import type { PdfNames } from './names.ts';
import type { PdfOutline } from './outline.ts';
import type { PdfMetadata } from './metadata.ts';
import type { PdfPageLabels } from './page_label.ts';
import type { PdfAnnotation } from './annotation.ts';
/** The document catalog: the `/Root` the trailer points at. */
export declare class PdfCatalog extends PdfObject<PdfDict> {
    readonly pageList: PdfPageList;
    names: PdfNames | null;
    outline: PdfOutline | null;
    metadata: PdfMetadata | null;
    pageLabels: PdfPageLabels | null;
    readonly formFields: PdfAnnotation[];
    readonly formFonts: Map<string, PdfObject<PdfDict>>;
    showOutlines: boolean;
    constructor(document: PdfObjectRegistry, pageList: PdfPageList, objser?: number);
    prepare(): void;
}
