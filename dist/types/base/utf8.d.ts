/**
 * The UTF-16 code units of a string, which is what Dart's `String.codeUnits`
 * yields. Not code *points*: a symbology that rejects anything above U+00FF
 * has to see the surrogate pair, not the character it forms.
 *
 * `Uint16Array` and not `Uint8Array`, per AGENTS.md §3: a code unit is sixteen
 * bits, and narrowing it to eight would silently truncate every character above
 * U+00FF into a different one — which is exactly the case the symbologies call
 * this to detect and reject.
 */
export declare function codeUnits(text: string): Uint16Array;
/**
 * Encode a string to UTF-8 bytes. Unpaired surrogates become U+FFFD.
 *
 * Written straight into a `Uint8Array` rather than collected and converted, per
 * AGENTS.md §3. Three bytes per UTF-16 code unit is an exact ceiling and not an
 * estimate: the only four-byte sequences come from surrogate pairs, which are
 * two units, so nothing costs more per unit than a three-byte character does.
 */
export declare function utf8Encode(text: string): Uint8Array;
/** Decode UTF-8 bytes back to a string. Malformed sequences become U+FFFD. */
export declare function utf8Decode(bytes: Uint8Array): string;
