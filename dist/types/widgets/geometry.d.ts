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
/**
 * Upstream's `EdgeInsets` named constructors, as a frozen object of factories.
 *
 * `InsetsInput` already accepts every shape these produce, so this is sugar for
 * callers who prefer the upstream spelling — `EdgeInsets.only({ left: 8 })`
 * reads the same in both languages. A `class` with static methods would work
 * too; a frozen object matches how `PageFormat` is exposed and stays erasable.
 */
export declare const EdgeInsets: Readonly<{
    zero: Insets;
    all(value: number): Insets;
    symmetric({ vertical, horizontal }: {
        vertical?: number;
        horizontal?: number;
    }): Insets;
    only({ top, right, bottom, left }?: Partial<Insets>): Insets;
    fromLTRB(left: number, top: number, right: number, bottom: number): Insets;
}>;
/** Total inset along each axis, upstream's `horizontal` / `vertical` getters. */
export declare function insetsHorizontal(insets: Insets): number;
export declare function insetsVertical(insets: Insets): number;
/**
 * A point in the -1…1 alignment square, upstream's `Alignment`.
 *
 * The constant values are upstream's, so `Alignment.topLeft` is `(-1, 1)` —
 * **y grows upward** here, matching dart_pdf's PDF-space convention. The widget
 * layer is y-down (see ARCHITECTURE.md §4), so `inscribe` flips the sign rather
 * than the constants; keeping the constants means an upstream snippet reads the
 * same after porting.
 */
export interface Alignment {
    readonly x: number;
    readonly y: number;
}
export declare const Alignment: Readonly<{
    topLeft: Alignment;
    topCenter: Alignment;
    topRight: Alignment;
    centerLeft: Alignment;
    center: Alignment;
    centerRight: Alignment;
    bottomLeft: Alignment;
    bottomCenter: Alignment;
    bottomRight: Alignment;
}>;
/** A top-left offset, the widget layer's placement unit. */
export interface Offset {
    readonly dx: number;
    readonly dy: number;
}
/**
 * Place a `childWidth` × `childHeight` box inside a `boxWidth` × `boxHeight`
 * one — upstream `Alignment.inscribe`, returning the offset instead of a rect
 * because the port's parents position children by offset.
 *
 * The `y` term is subtracted, not added: upstream inscribes in PDF space where
 * y grows upward, and this layer is y-down.
 */
export declare function inscribe(alignment: Alignment, childWidth: number, childHeight: number, boxWidth: number, boxHeight: number): Offset;
