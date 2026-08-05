export type JpegColorSpace = 'gray' | 'rgb' | 'cmyk';
export interface JpegInfo {
    readonly width: number;
    readonly height: number;
    readonly bitsPerComponent: number;
    readonly components: number;
    readonly colorSpace: JpegColorSpace;
    readonly inverted: boolean;
}
/** Read baseline JPEG dimensions and colour metadata without decoding pixels. */
export declare function parseJpeg(bytes: Uint8Array): JpegInfo;
