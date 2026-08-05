import type { DocumentMetadata } from '../pdf/document.ts';
import type { Section } from './page.ts';
export interface DocumentOptions {
    readonly title?: string | null;
    readonly author?: string | null;
    readonly subject?: string | null;
    readonly creator?: string | null;
    readonly producer?: string | null;
}
export declare class Document {
    readonly metadata: DocumentMetadata;
    readonly sections: Section[];
    constructor({ title, author, subject, creator, producer }?: DocumentOptions);
    addPage(page: Section): this;
    save(): Uint8Array;
}
