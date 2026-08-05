import type { ColorInput, Rgb } from '../pdf/color.ts';
import { Alignment } from './geometry.ts';
import type { Insets, InsetsInput } from './geometry.ts';
import { Widget } from './widget.ts';
import type { AnyLayoutBox, AnyWidget, Constraints, LayoutBox, PositionedBox, RenderContext } from './widget.ts';
/** What a widget with one optional child hands from `layout` to `paint`. */
export interface SingleChildLayoutData {
    readonly childBox: AnyLayoutBox | null;
}
export interface PaddingOptions {
    readonly padding?: InsetsInput;
    readonly child?: AnyWidget | null;
}
/** Insets its child by `padding`, growing by that much in each direction. */
export declare class Padding extends Widget<SingleChildLayoutData> {
    readonly padding: Insets;
    readonly child: AnyWidget | null;
    constructor({ padding, child }?: PaddingOptions);
    layout(context: RenderContext, constraints: Constraints): LayoutBox<SingleChildLayoutData>;
    paint(context: RenderContext, box: PositionedBox<SingleChildLayoutData>): void;
}
/** `Align` places its child, so it carries the child's offset within its box. */
export interface AlignLayoutData extends SingleChildLayoutData {
    readonly dx: number;
    readonly dy: number;
}
export interface AlignOptions {
    readonly alignment?: Alignment;
    readonly widthFactor?: number | null;
    readonly heightFactor?: number | null;
    readonly child?: AnyWidget | null;
}
/**
 * Positions its child inside itself according to `alignment`.
 *
 * Sizing follows upstream: an axis shrink-wraps the child when a factor is given
 * for it, and otherwise fills the constraint. Upstream also shrink-wraps an axis
 * whose constraint is infinite, which never happens here — this port's
 * constraints are always finite — so the practical rule is *fill unless a factor
 * says otherwise*.
 *
 * PORT GAP, and a sharp edge worth knowing: upstream's `Flex` gives its children
 * an infinite main-axis constraint, so an `Align` inside a `Column` shrink-wraps
 * its height there. This port's `Column` passes the remaining page height
 * instead, so an `Align` inside one currently claims all of it. Pass
 * `heightFactor: 1` to shrink-wrap in the meantime. The real fix is phase 3.4's
 * flex algorithm, not a special case here.
 */
export declare class Align extends Widget<AlignLayoutData> {
    readonly alignment: Alignment;
    readonly widthFactor: number | null;
    readonly heightFactor: number | null;
    readonly child: AnyWidget | null;
    constructor({ alignment, widthFactor, heightFactor, child }?: AlignOptions);
    layout(context: RenderContext, constraints: Constraints): LayoutBox<AlignLayoutData>;
    paint(context: RenderContext, box: PositionedBox<AlignLayoutData>): void;
}
export interface CenterOptions {
    readonly widthFactor?: number | null;
    readonly heightFactor?: number | null;
    readonly child?: AnyWidget | null;
}
/** `Align` fixed to the centre, exactly as upstream defines it. */
export declare class Center extends Align {
    constructor({ widthFactor, heightFactor, child }?: CenterOptions);
}
export interface SizedBoxOptions {
    readonly width?: number | null;
    readonly height?: number | null;
    readonly child?: AnyWidget | null;
}
/**
 * A box of a stated size.
 *
 * Upstream builds a `ConstrainedBox` with tight constraints, which forces the
 * child to that exact size. Without minimums in `Constraints` this instead
 * *offers* the size to the child as a maximum and reports the stated size
 * regardless of what the child took — the box occupies the right space either
 * way, and a child that would have stretched into it simply does not. That
 * distinction disappears when phase 3.4 introduces real `BoxConstraints`.
 *
 * With no child and no size, this is upstream's `SizedBox.shrink()`.
 */
export declare class SizedBox extends Widget<SingleChildLayoutData> {
    readonly width: number | null;
    readonly height: number | null;
    readonly child: AnyWidget | null;
    constructor({ width, height, child }?: SizedBoxOptions);
    layout(context: RenderContext, constraints: Constraints): LayoutBox<SingleChildLayoutData>;
    paint(context: RenderContext, box: PositionedBox<SingleChildLayoutData>): void;
}
export interface DividerOptions {
    readonly height?: number;
    readonly thickness?: number;
    readonly indent?: number;
    readonly endIndent?: number;
    readonly color?: ColorInput;
}
export declare const DEFAULT_DIVIDER_HEIGHT = 16;
export declare const DEFAULT_DIVIDER_THICKNESS = 1;
/**
 * A horizontal rule: a `thickness`-tall line centred in a `height`-tall box,
 * inset by `indent` at the leading edge and `endIndent` at the trailing one.
 *
 * Upstream composes this out of `SizedBox` + `Center` + `Container` +
 * `BoxDecoration` + `Border` + `BorderSide`. Decoration is phase 3.5, so the
 * port fills the rule directly; the emitted `re f` is what upstream's bottom
 * border would have produced anyway. Revisit the composition when 3.5 lands.
 */
export declare class Divider extends Widget<null> {
    readonly height: number;
    readonly thickness: number;
    readonly indent: number;
    readonly endIndent: number;
    readonly color: Rgb;
    constructor({ height, thickness, indent, endIndent, color }?: DividerOptions);
    layout(_context: RenderContext, constraints: Constraints): LayoutBox<null>;
    paint(context: RenderContext, box: PositionedBox<null>): void;
}
