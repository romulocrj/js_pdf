import { PdfImage } from '../pdf/obj/image.ts';
import type { PdfImageOrientation } from '../pdf/obj/image.ts';
import type { PdfPoint } from '../pdf/rect.ts';
export declare abstract class ImageProvider {
    readonly dpi: number | null;
    readonly orientation: PdfImageOrientation;
    private readonly sourceWidth;
    private readonly sourceHeight;
    private readonly cache;
    protected constructor(width: number, height: number, orientation: PdfImageOrientation, dpi: number | null);
    get width(): number;
    get height(): number;
    protected abstract buildImage(width?: number): PdfImage;
    resolve(size?: PdfPoint, dpi?: number | null): PdfImage;
}
export declare class ImageProxy extends ImageProvider {
    private readonly image;
    constructor(image: PdfImage, { dpi }?: {
        readonly dpi?: number | null;
    });
    protected buildImage(_width?: number): PdfImage;
}
export interface MemoryImageOptions {
    readonly orientation?: PdfImageOrientation;
    readonly dpi?: number | null;
}
export declare class MemoryImage extends ImageProvider {
    readonly bytes: Uint8Array;
    private readonly jpegInfo;
    constructor(bytes: Uint8Array, { orientation, dpi }?: MemoryImageOptions);
    protected buildImage(width?: number): PdfImage;
}
export interface RawImageOptions {
    readonly bytes: Uint8Array;
    readonly width: number;
    readonly height: number;
    readonly orientation?: PdfImageOrientation;
    readonly dpi?: number | null;
}
export declare class RawImage extends ImageProvider {
    private readonly image;
    constructor({ bytes, width, height, orientation, dpi }: RawImageOptions);
    protected buildImage(width?: number): PdfImage;
}
