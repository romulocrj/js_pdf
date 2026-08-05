/**
 * Serialize a number the way PDF operators expect: no exponent notation, no
 * trailing zeros, and no negative zero.
 */
export declare function formatNumber(value: number): string;
