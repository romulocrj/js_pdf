/**
 * Isolated presentation forms a font may only map through the base letter.
 * Upstream listed U+FEEF, ALEF MAKSURA ISOLATED FORM, for yeh (issue #2000);
 * yeh's isolated form is U+FEF1, and U+FEEF belongs to U+0649.
 */
export declare const basicToIsolatedMappings: ReadonlyMap<number, number>;
/** Convert logical RTL paragraphs into the visual runs consumed by PDF text. */
export declare function logicalToVisual(input: string): string;
