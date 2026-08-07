export type JpegColorSpace = 'gray' | 'rgb' | 'cmyk';
export type JpegOrientation = 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft' | 'leftTop' | 'rightTop' | 'rightBottom' | 'leftBottom';
export interface JpegInfo {
    readonly width: number;
    readonly height: number;
    readonly bitsPerComponent: number;
    readonly components: number;
    readonly colorSpace: JpegColorSpace;
    readonly inverted: boolean;
    readonly orientation: JpegOrientation;
}
/** Read JPEG dimensions and colour metadata without decoding pixels. */
export declare function parseJpeg(bytes: Uint8Array): JpegInfo;
