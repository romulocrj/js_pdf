import type { ColorInput, Rgb } from '../pdf/color.ts';
import type { PdfPoint, PdfRect } from '../pdf/rect.ts';
import { BorderRadiusGeometry } from './border_radius.ts';
import type { RadiusValue, TextDirection } from './border_radius.ts';
import { BoxBorder } from './box_border.ts';
import type { BoxBorderInput } from './box_border.ts';
import { Alignment } from './geometry.ts';
import type { RenderContext } from './widget.ts';
export type DecorationPosition = 'background' | 'foreground';
export type TileMode = 'clamp';
export type BoxShape = 'circle' | 'rectangle';
export type PaintPhase = 'all' | 'background' | 'foreground';
export interface GradientOptions {
    readonly colors: readonly ColorInput[];
    readonly stops?: readonly number[] | null;
}
/** A colour ramp capable of painting the current decoration path. */
export declare abstract class Gradient {
    readonly colors: readonly Rgb[];
    readonly stops: readonly number[];
    constructor({ colors, stops }: GradientOptions);
    abstract paint(context: RenderContext, box: PdfRect): void;
}
export interface LinearGradientOptions extends GradientOptions {
    readonly begin?: Alignment;
    readonly end?: Alignment;
    readonly tileMode?: TileMode;
}
/** An axial PDF shading between two alignment points. */
export declare class LinearGradient extends Gradient {
    readonly begin: Alignment;
    readonly end: Alignment;
    readonly tileMode: TileMode;
    constructor({ colors, stops, begin, end, tileMode }: LinearGradientOptions);
    paint(context: RenderContext, box: PdfRect): void;
}
export interface RadialGradientOptions extends GradientOptions {
    readonly center?: Alignment;
    readonly radius?: number;
    readonly tileMode?: TileMode;
    readonly focal?: Alignment | null;
    readonly focalRadius?: number;
}
/** A radial PDF shading with optional independent focal point. */
export declare class RadialGradient extends Gradient {
    readonly center: Alignment;
    readonly radius: number;
    readonly tileMode: TileMode;
    readonly focal: Alignment | null;
    readonly focalRadius: number;
    constructor({ colors, stops, center, radius, tileMode, focal, focalRadius }: RadialGradientOptions);
    paint(context: RenderContext, box: PdfRect): void;
}
export interface BoxShadowOptions {
    readonly color?: ColorInput;
    readonly offset?: PdfPoint;
    readonly blurRadius?: number;
    readonly spreadRadius?: number;
    readonly opacity?: number;
}
/** One vector shadow layer. */
export declare class BoxShadow {
    readonly color: Rgb;
    readonly offset: PdfPoint;
    readonly blurRadius: number;
    readonly spreadRadius: number;
    readonly opacity: number;
    constructor({ color, offset, blurRadius, spreadRadius, opacity }?: BoxShadowOptions);
}
export type BoxShadowInput = BoxShadow | BoxShadowOptions;
export interface BoxDecorationOptions {
    readonly color?: ColorInput | null;
    readonly border?: BoxBorderInput | null;
    readonly borderRadius?: BorderRadiusGeometry | RadiusValue | null;
    readonly boxShadow?: readonly BoxShadowInput[] | null;
    readonly gradient?: Gradient | null;
    readonly shape?: BoxShape;
}
/** Background fill, gradient, shadows and foreground border for a box. */
export declare class BoxDecoration {
    readonly color: Rgb | null;
    readonly border: BoxBorder | null;
    readonly borderRadius: BorderRadiusGeometry | null;
    readonly boxShadow: readonly BoxShadow[];
    readonly gradient: Gradient | null;
    readonly shape: BoxShape;
    constructor({ color, border, borderRadius, boxShadow, gradient, shape }?: BoxDecorationOptions);
    paint(context: RenderContext, x: number, y: number, width: number, height: number, phase?: PaintPhase, direction?: TextDirection): void;
}
export type BoxDecorationInput = BoxDecoration | BoxDecorationOptions;
export declare function normalizeBoxDecoration(value: BoxDecorationInput | null | undefined): BoxDecoration | null;
