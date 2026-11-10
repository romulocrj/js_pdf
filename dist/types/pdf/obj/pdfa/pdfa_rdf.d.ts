export interface PdfaRdfOptions {
    readonly title?: string | null;
    readonly author?: string | null;
    readonly creator?: string | null;
    readonly subject?: string | null;
    readonly keywords?: string | null;
    readonly producer?: string | null;
    /** `xmp:CreateDate`; now when omitted. */
    readonly creationDate?: Date | null;
    /** `xmp:ModifyDate`, written only when given. */
    readonly modificationDate?: Date | null;
    readonly part?: number;
    readonly conformance?: string;
    /** Raw RDF inserted inside `rdf:RDF`, such as `PdfaFacturxRdf().create()`. */
    readonly invoiceRdf?: string;
}
/**
 * Drop the characters XML 1.0 forbids: escaping alone would leave a NUL or a
 * stray control character no parser reads back. Lone surrogates and the two
 * noncharacters go too, since they cannot be written as UTF-8.
 */
export declare function pdfaClean(value: string): string;
/** `value` as XML character data. `\r` is a reference, or a parser reads `\n`. */
export declare function xmlText(value: string): string;
/** The XMP packet a PDF/A file carries as its catalog `/Metadata`. */
export declare class PdfaRdf {
    readonly title: string | null;
    readonly author: string | null;
    readonly creator: string | null;
    readonly subject: string | null;
    readonly keywords: string | null;
    readonly producer: string | null;
    readonly creationDate: Date;
    readonly modificationDate: Date | null;
    readonly part: number;
    readonly conformance: string;
    readonly invoiceRdf: string;
    constructor({ title, author, creator, subject, keywords, producer, creationDate, modificationDate, part, conformance, invoiceRdf }?: PdfaRdfOptions);
    create(): string;
}
