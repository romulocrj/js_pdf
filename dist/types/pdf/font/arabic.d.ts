export declare function isArabicDiacritic(codePoint: number): boolean;
export declare function isArabicCodePoint(codePoint: number): boolean;
/** Shape Arabic presentation forms while preserving logical character order. */
export declare function shapeArabicLogical(input: string): string;
/** Shape one logical Arabic run and return its visual presentation forms. */
export declare function shapeArabicVisual(input: string): string;
