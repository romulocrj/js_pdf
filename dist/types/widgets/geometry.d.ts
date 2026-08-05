/** Structural input accepted wherever callers historically supplied maxima. */
export interface BoxConstraintsInput {
    readonly minWidth?: number;
    readonly maxWidth?: number;
    readonly minHeight?: number;
    readonly maxHeight?: number;
}
export interface ConstraintSize {
    readonly width: number;
    readonly height: number;
}
/**
 * The four-sided size contract used by every widget.
 *
 * This is a direct value-type port of upstream `BoxConstraints`. The static
 * factories replace Dart's named constructors, while `from()` keeps the old
 * `{ maxWidth, maxHeight }` layout probes source-compatible.
 */
export declare class BoxConstraints {
    readonly minWidth: number;
    readonly maxWidth: number;
    readonly minHeight: number;
    readonly maxHeight: number;
    constructor({ minWidth, maxWidth, minHeight, maxHeight }?: BoxConstraintsInput);
    static from(value: BoxConstraintsInput): BoxConstraints;
    static tightFor({ width, height }?: {
        readonly width?: number | null;
        readonly height?: number | null;
    }): BoxConstraints;
    static tight(size: ConstraintSize): BoxConstraints;
    static expand({ width, height }?: {
        readonly width?: number;
        readonly height?: number;
    }): BoxConstraints;
    static tightForFinite({ width, height }?: {
        readonly width?: number;
        readonly height?: number;
    }): BoxConstraints;
    get hasBoundedWidth(): boolean;
    get hasBoundedHeight(): boolean;
    get hasInfiniteWidth(): boolean;
    get hasInfiniteHeight(): boolean;
    get hasTightWidth(): boolean;
    get hasTightHeight(): boolean;
    get isTight(): boolean;
    get biggest(): ConstraintSize;
    get smallest(): ConstraintSize;
    constrainWidth(width?: number): number;
    constrainHeight(height?: number): number;
    constrain(size: ConstraintSize): ConstraintSize;
    constrainSizeAndAttemptToPreserveAspectRatio(size: ConstraintSize): ConstraintSize;
    tighten({ width, height }?: {
        readonly width?: number | null;
        readonly height?: number | null;
    }): BoxConstraints;
    deflate(edges: InsetsInput): BoxConstraints;
    loosen(): BoxConstraints;
    enforce(other: BoxConstraintsInput): BoxConstraints;
    copyWith(values?: BoxConstraintsInput): BoxConstraints;
}
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
    readonly all?: number;
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
export interface EdgeInsetsConstructor {
    new (value?: InsetsInput): Insets;
    readonly zero: Insets;
    all(value: number): Insets;
    symmetric(options?: {
        readonly vertical?: number;
        readonly horizontal?: number;
    }): Insets;
    only(options?: Partial<Insets>): Insets;
    fromLTRB(left: number, top: number, right: number, bottom: number): Insets;
}
export declare const EdgeInsets: EdgeInsetsConstructor;
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
