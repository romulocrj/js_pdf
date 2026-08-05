import { PdfDataType } from './base.ts';
import type { PdfStream } from './stream.ts';
export declare function toWinAnsiByte(codePoint: number): number;
/**
 * A PDF literal string `(...)`, escaped and down-converted to WinAnsi.
 *
 * Text outside WinAnsi becomes `?` until TTF embedding lands and strings can
 * be emitted as hex-encoded CID glyph indices instead.
 */
export declare function pdfLiteral(value: string): string;
/** A PDF string object. */
export declare class PdfString extends PdfDataType {
    readonly value: string;
    constructor(value: string);
    output(s: PdfStream): void;
}
