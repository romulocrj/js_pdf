export declare function isArabicDiacritic(codePoint: number): boolean;
export declare function isArabicCodePoint(codePoint: number): boolean;
/**
 * Shape `text.slice(start, end)` into presentation forms, in logical order.
 *
 * The letters around the range still decide the joining, so a word split
 * over two styled spans keeps its connected forms. Every Arabic letter is a
 * BMP unit, so this walks UTF-16 units and leaves anything else untouched. A
 * lam-alef pair becomes one ligature on the lam and its alef produces
 * nothing; diacritics stay where they were. The cluster rewrite this replaces
 * assumed the alef directly followed the lam, so a mark between the two was
 * lost and the alef drawn a second time.
 */
export declare function shapeArabicRange(text: string, start?: number, end?: number): string;
/** Shape Arabic presentation forms while preserving logical character order. */
export declare function shapeArabicLogical(input: string): string;
/** Shape one logical Arabic run and return its visual presentation forms. */
export declare function shapeArabicVisual(input: string): string;
