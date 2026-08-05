import type { PageSize } from './page_format.ts';
export interface DocumentMetadata {
    readonly title?: string | null;
    readonly author?: string | null;
    readonly subject?: string | null;
    readonly creator?: string | null;
    readonly producer?: string | null;
}
/** One physical page, with its content stream already rendered to operators. */
export interface SerializedPage {
    readonly format: PageSize;
    readonly content: string;
}
/** Write the object table, the classic cross-reference table and the trailer. */
export declare function serializePdf(pages: readonly SerializedPage[], metadata: DocumentMetadata): Uint8Array;
