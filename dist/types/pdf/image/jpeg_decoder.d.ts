export interface DecodedJpeg {
    readonly width: number;
    readonly height: number;
    readonly rgb: Uint8Array;
}
/** Decode baseline or progressive JPEG samples into a packed RGB buffer. */
export declare function decodeJpeg(bytes: Uint8Array, targetWidth?: number): DecodedJpeg;
