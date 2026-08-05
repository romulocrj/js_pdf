export interface Insets {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
}
/**
 * Upstream this is `EdgeInsets` with its `.all` / `.symmetric` / `.only`
 * constructors; a JavaScript caller expresses the same three shapes as a
 * number, a `{vertical, horizontal}` pair, or explicit sides.
 */
export type InsetsInput = number | (Partial<Insets> & {
    readonly vertical?: number;
    readonly horizontal?: number;
});
export declare function normalizeInsets(value?: InsetsInput): Insets;
