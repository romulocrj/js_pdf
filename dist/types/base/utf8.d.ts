/**
 * The UTF-16 code units of a string, which is what Dart's `String.codeUnits`
 * yields. Not code *points*: a symbology that rejects anything above U+00FF
 * has to see the surrogate pair, not the character it forms.
 */
export declare function codeUnits(text: string): number[];
/** Encode a string to UTF-8 bytes. Unpaired surrogates become U+FFFD. */
export declare function utf8Encode(text: string): Uint8Array;
/** Decode UTF-8 bytes back to a string. Malformed sequences become U+FFFD. */
export declare function utf8Decode(bytes: Uint8Array): string;
