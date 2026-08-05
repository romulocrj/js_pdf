export interface DecodedPng {
    readonly width: number;
    readonly height: number;
    readonly pixels: Uint8Array;
    readonly hasAlpha: boolean;
}
/** Inflate a complete RFC 1950 zlib stream containing RFC 1951 blocks. */
export declare function inflateZlib(bytes: Uint8Array): Uint8Array;
/** Decode PNG bytes to row-major RGBA pixels without using a host codec. */
export declare function decodePng(bytes: Uint8Array): DecodedPng;
