/** Compress `data` to a raw RFC 1951 DEFLATE stream. */
export declare function deflateRaw(data: Uint8Array): Uint8Array;
/**
 * Compress `data` to an RFC 1950 zlib stream — the framing `/FlateDecode`
 * expects.
 */
export declare function deflateZlib(data: Uint8Array): Uint8Array;
