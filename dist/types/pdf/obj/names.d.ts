import { PdfDict } from '../format/dict.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';
import type { PdfPage } from './page.ts';
/** The catalog `/Names` dictionary, currently containing named destinations. */
export declare class PdfNames extends PdfObject<PdfDict> {
    private readonly destinations;
    constructor(document: PdfObjectRegistry);
    addDestination(name: string, page: PdfPage, { x, y, zoom }?: {
        readonly x?: number | null;
        readonly y?: number | null;
        readonly zoom?: number | null;
    }): void;
    prepare(): void;
}
