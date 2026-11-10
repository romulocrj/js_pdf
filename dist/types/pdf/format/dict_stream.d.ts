import type { PdfDataType } from './base.ts';
import { PdfDict } from './dict.ts';
import type { PdfStream } from './stream.ts';
/** A stream object: a dictionary describing bytes, followed by those bytes. */
export declare class PdfDictStream extends PdfDict {
    data: Uint8Array;
    /**
     * Whether this stream may be deflated. Off for data that is already
     * compressed — a JPEG carries its own `/DCTDecode` — where a second pass
     * would cost time and give nothing back.
     */
    readonly compress: boolean;
    /**
     * Always write a line feed before `endstream`, outside `/Length`. PDF/A
     * requires that marker (ISO 19005-2 6.1.7.1); otherwise data that already
     * ends in a line feed lets it stand in, which keeps the output unchanged.
     */
    readonly eol: boolean;
    constructor(data?: Uint8Array, values?: Iterable<readonly [string, PdfDataType]>, compress?: boolean, eol?: boolean);
    output(s: PdfStream): void;
}
