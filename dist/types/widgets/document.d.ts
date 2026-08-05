import type { DocumentMetadata } from '../pdf/document.ts';
import type { PdfFont } from '../pdf/font/font.ts';
import type { Section } from './page.ts';
export interface DocumentOptions {
    readonly title?: string | null;
    readonly author?: string | null;
    readonly subject?: string | null;
    readonly creator?: string | null;
    readonly producer?: string | null;
    /**
     * The font a widget draws with when it names none of its own. As of phase 0.3
     * this is a default rather than the document's only font — each page registers
     * whatever its content stream actually used. Phase 1.4 replaces it with
     * `ThemeData`, of which this is the one-field ancestor.
     */
    readonly font?: PdfFont;
}
export declare class Document {
    readonly metadata: DocumentMetadata;
    readonly font: PdfFont;
    readonly sections: Section[];
    constructor({ title, author, subject, creator, producer, font }?: DocumentOptions);
    addPage(page: Section): this;
    save(): Uint8Array;
}
