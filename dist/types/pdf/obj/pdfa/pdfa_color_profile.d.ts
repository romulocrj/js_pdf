import { PdfArray } from '../../format/array.ts';
import type { PdfObjectRegistry } from '../object.ts';
import { PdfObjectStream } from '../object_stream.ts';
import type { PdfCatalog } from '../catalog.ts';
/** The device space an output intent describes; see `iccProfileInfo`. */
export type PdfaColorSpace = 'RGB' | 'CMYK' | 'GRAY';
/**
 * Check an ICC profile's header and tag table, and return its colour space.
 * PDF/A output intents take a monitor or output profile (ISO 19005-2 6.2.3)
 * for an RGB, CMYK or gray device.
 */
export declare function iccProfileInfo(icc: Uint8Array): {
    readonly colorSpace: PdfaColorSpace;
    readonly components: number;
};
/** The `/DestOutputProfile` stream and the PDF/A output intent naming it. */
export declare class PdfaColorProfile extends PdfObjectStream {
    readonly icc: Uint8Array;
    readonly colorSpace: PdfaColorSpace;
    readonly outputCondition: string;
    constructor(document: PdfObjectRegistry & {
        readonly catalog: PdfCatalog;
    }, icc: Uint8Array, outputCondition?: string);
    outputIntents(): PdfArray;
}
