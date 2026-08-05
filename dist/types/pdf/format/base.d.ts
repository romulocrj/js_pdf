import { PdfStream } from './stream.ts';
/**
 * A value that can appear in PDF object syntax and knows how to serialize
 * itself. This is the seam that replaces the flat string building the port used
 * before roadmap phase 0.2.
 */
export declare abstract class PdfDataType {
    abstract output(s: PdfStream): void;
    /**
     * The serialized form as a Latin-1 string. For tests, diagnostics and the
     * font resource-dictionary seam — never used to build the file itself, which
     * always goes through a shared `PdfStream`.
     */
    toString(): string;
}
