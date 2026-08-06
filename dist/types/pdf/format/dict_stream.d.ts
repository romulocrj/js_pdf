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
    constructor(data?: Uint8Array, values?: Iterable<readonly [string, PdfDataType]>, compress?: boolean);
    output(s: PdfStream): void;
}
