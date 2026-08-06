import { PdfDict } from '../format/dict.ts';
import type { PdfRect } from '../rect.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';
import type { PdfPage } from './page.ts';
export interface PdfUrlLinkAnnotation {
    readonly kind: 'url';
    readonly rect: PdfRect;
    readonly destination: string;
}
export interface PdfNamedLinkAnnotation {
    readonly kind: 'destination';
    readonly rect: PdfRect;
    readonly destination: string;
}
export type PdfLinkAnnotation = PdfUrlLinkAnnotation | PdfNamedLinkAnnotation;
/** One invisible clickable rectangle in a page's `/Annots` array. */
export declare class PdfAnnotation extends PdfObject<PdfDict> {
    readonly page: PdfPage;
    readonly annotation: PdfLinkAnnotation;
    constructor(document: PdfObjectRegistry, page: PdfPage, annotation: PdfLinkAnnotation);
    prepare(): void;
}
