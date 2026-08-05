import type { PdfObjectRegistry } from './object.ts';
import { PdfXObject } from './xobject.ts';
export type PdfImageOrientation = 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft' | 'leftTop' | 'rightTop' | 'rightBottom' | 'leftBottom';
export interface PdfImageOptions {
    readonly pixels: Uint8Array;
    readonly width: number;
    readonly height: number;
    readonly hasAlpha?: boolean;
    readonly orientation?: PdfImageOrientation;
}
/** Decoded raster resource, independent of any one output document. */
export declare class PdfImage {
    readonly pixels: Uint8Array;
    readonly sourceWidth: number;
    readonly sourceHeight: number;
    readonly hasAlpha: boolean;
    readonly orientation: PdfImageOrientation;
    constructor({ pixels, width, height, hasAlpha, orientation }: PdfImageOptions);
    static fromPng(bytes: Uint8Array, orientation?: PdfImageOrientation): PdfImage;
    get width(): number;
    get height(): number;
}
/** The final `/Subtype /Image` stream created inside one PDF registry. */
export declare class PdfImageObject extends PdfXObject {
    constructor(document: PdfObjectRegistry, image: PdfImage, channel: 'rgb' | 'alpha');
    setSoftMask(mask: PdfImageObject): void;
}
