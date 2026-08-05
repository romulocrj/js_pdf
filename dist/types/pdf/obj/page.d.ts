import { PdfDict } from '../format/dict.ts';
import type { PdfObjectBase } from '../format/object_base.ts';
import type { PdfDataType } from '../format/base.ts';
import type { PageSize } from '../page_format.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';
import type { PdfPageList } from './page_list.ts';
/** One page object, holding its size and a reference to its content stream. */
export declare class PdfPage extends PdfObject<PdfDict> {
    readonly pageFormat: PageSize;
    readonly pageList: PdfPageList;
    readonly contents: PdfObjectBase<PdfDataType>[];
    /** The single font this page's `/Resources` exposes as `/F1`. */
    readonly font: PdfObjectBase<PdfDataType>;
    constructor(document: PdfObjectRegistry, pageList: PdfPageList, pageFormat: PageSize, font: PdfObjectBase<PdfDataType>);
    prepare(): void;
}
