import type { JpegInfo } from '../image/jpeg.ts';
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
interface EncodedJpegOptions {
    readonly jpeg: Uint8Array;
    readonly info: JpegInfo;
    readonly orientation: PdfImageOrientation;
}
interface DecodedChannelOptions {
    readonly rgb: Uint8Array;
    readonly alpha: Uint8Array | null;
    readonly width: number;
    readonly height: number;
    readonly orientation: PdfImageOrientation;
}
/** Decoded raster resource, independent of any one output document. */
export declare class PdfImage {
    private readonly rgb;
    private readonly alpha;
    private rgba;
    readonly jpeg: Uint8Array | null;
    readonly jpegInfo: JpegInfo | null;
    readonly sourceWidth: number;
    readonly sourceHeight: number;
    readonly hasAlpha: boolean;
    readonly orientation: PdfImageOrientation;
    constructor(options: PdfImageOptions | EncodedJpegOptions | DecodedChannelOptions);
    static fromPng(bytes: Uint8Array, orientation?: PdfImageOrientation): PdfImage;
    static fromJpeg(bytes: Uint8Array, orientation?: PdfImageOrientation): PdfImage;
    /** RGBA compatibility view, materialized only for callers that request it. */
    get pixels(): Uint8Array | null;
    channel(channel: 'rgb' | 'alpha'): Uint8Array;
    resize(width: number): PdfImage;
    get width(): number;
    get height(): number;
}
/** The final `/Subtype /Image` stream created inside one PDF registry. */
export declare class PdfImageObject extends PdfXObject {
    constructor(document: PdfObjectRegistry, image: PdfImage, channel: 'rgb' | 'alpha');
    setSoftMask(mask: PdfImageObject): void;
}
export {};
