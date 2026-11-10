import { PdfDict } from '../format/dict.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';
import type { PdfPage } from './page.ts';
/** The catalog `/Names` dictionary: named destinations and PDF/A-3 embedded files. */
export declare class PdfNames extends PdfObject<PdfDict> {
    /** The `/EmbeddedFiles` name tree, set by a PDF/A-3 document. */
    embeddedFiles: PdfObject<PdfDict> | null;
    /**
     * Keyed by name: a name tree holds each key once (ISO 32000-1 7.9.6), and
     * the last registration wins, as upstream's map does.
     */
    private readonly destinations;
    constructor(document: PdfObjectRegistry);
    has(name: string): boolean;
    addDestination(name: string, page: PdfPage, { x, y, zoom }?: {
        readonly x?: number | null;
        readonly y?: number | null;
        readonly zoom?: number | null;
    }): void;
    prepare(): void;
}
