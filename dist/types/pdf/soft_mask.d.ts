import type { PdfFont } from './font/font.ts';
import { PdfDataType } from './format/base.ts';
import type { PdfDict } from './format/dict.ts';
import type { PdfStream } from './format/stream.ts';
import type { PdfImage } from './obj/image.ts';
import type { PdfRect } from './rect.ts';
export interface PdfSoftMask {
    readonly content: Uint8Array;
    readonly boundingBox: PdfRect;
    readonly fonts: ReadonlyMap<PdfFont, string>;
    readonly graphicStates: ReadonlyMap<string, PdfDict>;
    readonly patterns: ReadonlyMap<string, PdfDict>;
    readonly images: ReadonlyMap<PdfImage, string>;
}
/** Deferred until the owning PDF document can allocate the form XObject. */
export declare class PdfSoftMaskReference extends PdfDataType {
    readonly mask: PdfSoftMask;
    constructor(mask: PdfSoftMask);
    output(_stream: PdfStream): void;
}
