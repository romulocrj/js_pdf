import { PdfDataType } from './base.ts';
import type { PdfStream } from './stream.ts';
export declare class PdfBool extends PdfDataType {
    readonly value: boolean;
    constructor(value: boolean);
    output(s: PdfStream): void;
}
