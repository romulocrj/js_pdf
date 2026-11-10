import { PdfDataType } from './base.ts';
import type { PdfStream } from './stream.ts';
/**
 * Code point to WinAnsi byte, `?` when the encoding has no glyph for it. The
 * C1 controls U+0080..U+009F are among those: their bytes hold CP1252's
 * typographic glyphs, so writing them through would draw a euro for U+0080.
 */
export declare function toWinAnsiByte(codePoint: number): number;
export declare function winAnsiRune(byte: number): number;
/** Whether `/WinAnsiEncoding` has a glyph for `codePoint`. */
export declare function isWinAnsiRune(codePoint: number): boolean;
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
/**
 * The bytes `PdfString` writes for `value`, one character per byte. Name-tree
 * keys are ordered by these (ISO 32000-1 7.9.6), not by locale collation.
 */
export declare function pdfTextBytes(value: string): string;
/** PDF text string encoded as UTF-16BE, including its required marker. */
export declare function pdfUnicodeString(value: string): string;
/** A PDF string object. */
export declare class PdfString extends PdfDataType {
    readonly value: string;
    constructor(value: string);
    /** A PDF date normalized to UTC, matching upstream's second precision. */
    static fromDate(date: Date): PdfString;
    output(s: PdfStream): void;
}
