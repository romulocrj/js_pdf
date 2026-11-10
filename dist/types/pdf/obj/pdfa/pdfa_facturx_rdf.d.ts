/**
 * The Factur-X / ZUGFeRD RDF for `PdfaRdf`'s `invoiceRdf` (or a document's
 * `pdfa.extensionRdf`): the `fx` properties plus the PDF/A extension schema
 * that declares them, which PDF/A requires for any non-standard namespace.
 * Indentation is dropped; XML ignores it between elements.
 */
export declare class PdfaFacturxRdf {
    create({ filename, namespace, conformanceLevel, version }?: {
        readonly filename?: string;
        readonly namespace?: string;
        readonly conformanceLevel?: string;
        readonly version?: string;
    }): string;
}
