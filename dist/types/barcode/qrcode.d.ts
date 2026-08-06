import { Barcode2D, Barcode2DMatrix } from './barcode_2d.ts';
/** QR error correction choices, ordered from least to most redundancy. */
export declare const BarcodeQRCorrectionLevel: {
    readonly low: 'low';
    readonly medium: 'medium';
    readonly quartile: 'quartile';
    readonly high: 'high';
};
export type BarcodeQRCorrectionLevel = (typeof BarcodeQRCorrectionLevel)[keyof typeof BarcodeQRCorrectionLevel];
/** QR Code backed by js_pdf's independent byte-mode encoder. */
export declare class BarcodeQR extends Barcode2D {
    readonly typeNumber: number | null;
    readonly errorCorrectLevel: BarcodeQRCorrectionLevel;
    constructor(typeNumber: number | null, errorCorrectLevel: BarcodeQRCorrectionLevel);
    get charSet(): Iterable<number>;
    get name(): string;
    get maxLength(): number;
    convert(data: Uint8Array): Barcode2DMatrix;
}
