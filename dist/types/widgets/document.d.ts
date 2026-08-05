import type { DocumentMetadata } from '../pdf/document.ts';
import type { PdfFont } from '../pdf/font/font.ts';
import type { Section } from './page.ts';
export interface DocumentOptions {
    readonly title?: string | null;
    readonly author?: string | null;
    readonly subject?: string | null;
    readonly creator?: string | null;
    readonly producer?: string | null;
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
