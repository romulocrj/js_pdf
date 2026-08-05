import { PdfDict } from '../format/dict.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';
import type { PdfPage } from './page.ts';
/** The `/Pages` object at the root of the page tree. */
export declare class PdfPageList extends PdfObject<PdfDict> {
    readonly pages: PdfPage[];
    constructor(document: PdfObjectRegistry, objser?: number);
    prepare(): void;
}
