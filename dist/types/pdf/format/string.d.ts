export declare function toWinAnsiByte(codePoint: number): number;
/**
 * A PDF literal string `(...)`, escaped and down-converted to WinAnsi.
 *
 * Text outside WinAnsi becomes `?` until TTF embedding lands and strings can
 * be emitted as hex-encoded CID glyph indices instead.
 */
export declare function pdfLiteral(value: string): string;
