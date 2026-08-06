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
/**
 * A PDF hex string `<...>`, written as fixed-width big-endian words.
 *
 * This is how text is emitted for a composite font: with `/Identity-H` the
 * bytes between the angle brackets are two-byte CIDs, not characters, so the
 * literal escaping rules above do not apply at all.
 */
export declare function pdfHexString(values: readonly number[], digits?: number): string;
/** A PDF string object. */
export declare class PdfString extends PdfDataType {
    readonly value: string;
    constructor(value: string);
    /** A PDF date normalized to UTC, matching upstream's second precision. */
    static fromDate(date: Date): PdfString;
    output(s: PdfStream): void;
}
