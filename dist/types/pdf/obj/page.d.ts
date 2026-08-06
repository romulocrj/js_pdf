import type { PdfObjectBase } from '../format/object_base.ts';
import type { PdfDataType } from '../format/base.ts';
import type { PageSize } from '../page_format.ts';
import { PdfGraphicStream } from './graphic_stream.ts';
import type { PdfObjectRegistry } from './object.ts';
import type { PdfPageList } from './page_list.ts';
import type { PdfAnnotation } from './annotation.ts';
/** One page object, holding its size and a reference to its content stream. */
export declare class PdfPage extends PdfGraphicStream {
    readonly pageFormat: PageSize;
    readonly pageList: PdfPageList;
    readonly contents: PdfObjectBase<PdfDataType>[];
    readonly annotations: PdfAnnotation[];
    constructor(document: PdfObjectRegistry, pageList: PdfPageList, pageFormat: PageSize);
    prepare(): void;
}
