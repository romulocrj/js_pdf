import type { ColorInput, Rgb } from '../pdf/color.ts';
import type { PdfCanvas } from '../pdf/graphics.ts';
import type { PdfMatrix } from '../pdf/matrix.ts';
import type { PdfPoint } from '../pdf/rect.ts';
import { Alignment } from './geometry.ts';
import type { Insets, InsetsInput, Offset } from './geometry.ts';
import type { BoxFit } from './svg.ts';
import { StatelessWidget, Widget } from './widget.ts';
import type { AnyLayoutBox, AnyWidget, Constraints, LayoutBox, PositionedBox, RenderContext, StatelessLayoutData } from './widget.ts';
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
export type BasicAlignmentName = 'topLeft' | 'topCenter' | 'topRight' | 'centerLeft' | 'center' | 'centerRight' | 'bottomLeft' | 'bottomCenter' | 'bottomRight';
export type BasicAlignmentInput = Alignment | BasicAlignmentName;
export interface TransformOptions {
    readonly transform?: PdfMatrix | null;
    readonly rotate?: number | null;
    readonly rotateBox?: number | null;
    readonly translate?: PdfPoint | Offset | null;
    readonly scale?: number | null;
    readonly origin?: PdfPoint | Offset | null;
    readonly alignment?: BasicAlignmentInput | null;
    readonly adjustLayout?: boolean;
    readonly unconstrained?: boolean;
    readonly child?: AnyWidget | null;
}
export interface TransformLayoutData extends SingleChildLayoutData {
    readonly layoutDx: number;
    readonly layoutDy: number;
}
/** Paints its child through a six-cell affine transform. */
export declare class Transform extends Widget<TransformLayoutData> {
    readonly transform: PdfMatrix;
    readonly origin: {
        readonly x: number;
        readonly y: number;
    };
    readonly alignment: Alignment | null;
    readonly adjustLayout: boolean;
    readonly unconstrained: boolean;
    readonly child: AnyWidget | null;
    constructor({ transform, rotate, rotateBox, translate, scale, origin, alignment, adjustLayout, unconstrained, child }?: TransformOptions);
    layout(context: RenderContext, constraints: Constraints): LayoutBox<TransformLayoutData>;
    paint(context: RenderContext, box: PositionedBox<TransformLayoutData>): void;
}
export interface OpacityOptions {
    readonly opacity: number;
    readonly child?: AnyWidget | null;
}
export declare class Opacity extends Widget<SingleChildLayoutData> {
    readonly opacity: number;
    readonly child: AnyWidget | null;
    constructor({ opacity, child }: OpacityOptions);
    layout(context: RenderContext, constraints: Constraints): LayoutBox<SingleChildLayoutData>;
    paint(context: RenderContext, box: PositionedBox<SingleChildLayoutData>): void;
}
export interface FittedBoxOptions {
    readonly fit?: BoxFit;
    readonly alignment?: BasicAlignmentInput;
    readonly child?: AnyWidget | null;
}
export interface FittedBoxLayoutData extends SingleChildLayoutData {
}
export declare class FittedBox extends Widget<FittedBoxLayoutData> {
    readonly fit: BoxFit;
    readonly alignment: Alignment;
    readonly child: AnyWidget | null;
    constructor({ fit, alignment, child }?: FittedBoxOptions);
    layout(context: RenderContext, constraints: Constraints): LayoutBox<FittedBoxLayoutData>;
    paint(context: RenderContext, box: PositionedBox<FittedBoxLayoutData>): void;
}
export interface AspectRatioOptions {
    readonly aspectRatio: number;
    readonly child?: AnyWidget | null;
}
export declare class AspectRatio extends Widget<SingleChildLayoutData> {
    readonly aspectRatio: number;
    readonly child: AnyWidget | null;
    constructor({ aspectRatio, child }: AspectRatioOptions);
    layout(context: RenderContext, constraints: Constraints): LayoutBox<SingleChildLayoutData>;
    paint(context: RenderContext, box: PositionedBox<SingleChildLayoutData>): void;
}
export type WidgetBuilder = (context: RenderContext) => AnyWidget;
export interface BuilderOptions {
    readonly builder: WidgetBuilder;
}
export declare class Builder extends StatelessWidget {
    readonly builder: WidgetBuilder;
    constructor({ builder }: BuilderOptions);
    build(context: RenderContext): AnyWidget;
}
export type LayoutWidgetBuilder = (context: RenderContext, constraints: Constraints) => AnyWidget;
export interface LayoutBuilderOptions {
    readonly builder: LayoutWidgetBuilder;
}
export declare class LayoutBuilder extends Widget<StatelessLayoutData> {
    readonly builder: LayoutWidgetBuilder;
    constructor({ builder }: LayoutBuilderOptions);
    layout(context: RenderContext, constraints: Constraints): LayoutBox<StatelessLayoutData>;
    paint(context: RenderContext, box: PositionedBox<StatelessLayoutData>): void;
}
export type CustomPainter = (canvas: PdfCanvas, size: PdfPoint) => void;
export interface CustomPaintOptions {
    readonly painter?: CustomPainter | null;
    readonly foregroundPainter?: CustomPainter | null;
    readonly size?: PdfPoint;
    readonly child?: AnyWidget | null;
}
export declare class CustomPaint extends Widget<SingleChildLayoutData> {
    readonly painter: CustomPainter | null;
    readonly foregroundPainter: CustomPainter | null;
    readonly size: PdfPoint;
    readonly child: AnyWidget | null;
    constructor({ painter, foregroundPainter, size, child }?: CustomPaintOptions);
    layout(context: RenderContext, constraints: Constraints): LayoutBox<SingleChildLayoutData>;
    private paintWithLocalCanvas;
    paint(context: RenderContext, box: PositionedBox<SingleChildLayoutData>): void;
}
export interface FullPageOptions {
    readonly ignoreMargins: boolean;
    readonly child?: AnyWidget | null;
}
export declare class FullPage extends Widget<SingleChildLayoutData> {
    readonly ignoreMargins: boolean;
    readonly child: AnyWidget | null;
    constructor({ ignoreMargins, child }: FullPageOptions);
    layout(context: RenderContext, constraints: Constraints): LayoutBox<SingleChildLayoutData>;
    paint(context: RenderContext, box: PositionedBox<SingleChildLayoutData>): void;
}
export interface LimitedBoxOptions {
    readonly maxWidth?: number;
    readonly maxHeight?: number;
    readonly child?: AnyWidget | null;
}
export declare class LimitedBox extends Widget<SingleChildLayoutData> {
    readonly maxWidth: number;
    readonly maxHeight: number;
    readonly child: AnyWidget | null;
    constructor({ maxWidth, maxHeight, child }?: LimitedBoxOptions);
    layout(context: RenderContext, constraints: Constraints): LayoutBox<SingleChildLayoutData>;
    paint(context: RenderContext, box: PositionedBox<SingleChildLayoutData>): void;
}
export interface VerticalDividerOptions {
    readonly width?: number;
    readonly thickness?: number;
    readonly indent?: number;
    readonly endIndent?: number;
    readonly color?: ColorInput;
}
export declare class VerticalDivider extends Widget<null> {
    readonly width: number;
    readonly thickness: number;
    readonly indent: number;
    readonly endIndent: number;
    readonly color: Rgb;
    constructor({ width, thickness, indent, endIndent, color }?: VerticalDividerOptions);
    layout(_context: RenderContext, constraints: Constraints): LayoutBox<null>;
    paint(context: RenderContext, box: PositionedBox<null>): void;
}
