/** Receives a warning. Called synchronously, during document construction. */
export type PdfDiagnosticHandler = (message: string) => void;
/**
 * Install the sink warnings are delivered to, replacing any previous one.
 *
 * Pass `null` to go back to the default, which is the host console.
 */
export declare function setPdfDiagnosticHandler(next: PdfDiagnosticHandler | null): void;
/** The installed sink, or `null` when the host console is being used. */
export declare function pdfDiagnosticHandler(): PdfDiagnosticHandler | null;
/** Deliver `message` to the installed sink, or to the host console. */
export declare function reportPdfDiagnostic(message: string): void;
