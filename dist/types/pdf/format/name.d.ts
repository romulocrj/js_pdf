import { PdfDataType } from './base.ts';
import type { PdfStream } from './stream.ts';
/**
 * A PDF name object, such as `/Type` or `/WinAnsiEncoding`. The leading slash
 * is part of the value, matching upstream.
 */
export declare class PdfName extends PdfDataType {
    readonly value: string;
    constructor(value: string);
    output(s: PdfStream): void;
}
