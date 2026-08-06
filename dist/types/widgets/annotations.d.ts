import type { ColorInput, Rgb } from '../pdf/color.ts';
import type { PdfGeometricAnnotationKind } from '../pdf/obj/annotation.ts';
import type { PdfPoint } from '../pdf/rect.ts';
import type { PdfOutlineStyle } from '../pdf/obj/outline.ts';
import { Widget } from './widget.ts';
import type { AnyLayoutBox, AnyWidget, Constraints, LayoutBox, PositionedBox, RenderContext } from './widget.ts';
export interface AnnotationRect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}
export declare abstract class AnnotationBuilder {
    abstract build(context: RenderContext, rect: AnnotationRect): void;
}
export declare class AnnotationLink extends AnnotationBuilder {
    readonly destination: string;
    constructor(destination: string);
    build(context: RenderContext, rect: AnnotationRect): void;
}
export declare class AnnotationUrl extends AnnotationBuilder {
    readonly destination: string;
    constructor(destination: string);
    build(context: RenderContext, rect: AnnotationRect): void;
}
export interface AnnotationOptions {
    readonly child?: AnyWidget | null;
    readonly builder?: AnnotationBuilder | null;
}
export interface AnnotationLayoutData {
    readonly childBox: AnyLayoutBox | null;
}
export declare class Annotation extends Widget<AnnotationLayoutData> {
    readonly child: AnyWidget | null;
    readonly builder: AnnotationBuilder | null;
    constructor({ child, builder }?: AnnotationOptions);
    layout(context: RenderContext, constraints: Constraints): LayoutBox<AnnotationLayoutData>;
    paint(context: RenderContext, box: PositionedBox<AnnotationLayoutData>): void;
}
export interface LinkOptions {
    readonly child: AnyWidget;
    readonly destination: string;
}
export declare class Link extends Annotation {
    constructor({ child, destination }: LinkOptions);
}
export declare class UrlLink extends Annotation {
    constructor({ child, destination }: LinkOptions);
}
export interface AnchorOptions {
    readonly child?: AnyWidget | null;
    readonly name: string;
    readonly zoom?: number | null;
    readonly setX?: boolean;
}
export declare class Anchor extends Widget<AnnotationLayoutData> {
    readonly child: AnyWidget | null;
    readonly name: string;
    readonly zoom: number | null;
    readonly setX: boolean;
    constructor({ child, name, zoom, setX }: AnchorOptions);
    layout(context: RenderContext, constraints: Constraints): LayoutBox<AnnotationLayoutData>;
    paint(context: RenderContext, box: PositionedBox<AnnotationLayoutData>): void;
}
export interface PdfBorder {
    readonly width?: number;
}
export interface GeometricAnnotationOptions {
    readonly color?: ColorInput | null;
    readonly interiorColor?: ColorInput | null;
    readonly border?: PdfBorder | null;
    readonly author?: string | null;
    readonly date?: Date | null;
    readonly subject?: string | null;
    readonly content?: string | null;
}
declare abstract class GeometricAnnotationBuilder extends AnnotationBuilder {
    readonly shape: PdfGeometricAnnotationKind;
    readonly color: Rgb | null;
    readonly interiorColor: Rgb | null;
    readonly borderWidth: number;
    readonly author: string | null;
    readonly date: Date | null;
    readonly subject: string | null;
    readonly content: string | null;
    constructor(shape: PdfGeometricAnnotationKind, { color, interiorColor, border, author, date, subject, content }?: GeometricAnnotationOptions);
    protected base(context: RenderContext, rect: AnnotationRect): {
        readonly rect: AnnotationRect;
        readonly color: Rgb | null;
        readonly interiorColor: Rgb | null;
        readonly borderWidth: number;
        readonly author: string | null;
        readonly subject: string | null;
        readonly content: string | null;
        readonly date: string | null;
    };
}
export declare class AnnotationSquare extends GeometricAnnotationBuilder {
    constructor(options?: GeometricAnnotationOptions);
    build(context: RenderContext, rect: AnnotationRect): void;
}
export declare class AnnotationCircle extends GeometricAnnotationBuilder {
    constructor(options?: GeometricAnnotationOptions);
    build(context: RenderContext, rect: AnnotationRect): void;
}
export interface PointAnnotationOptions extends GeometricAnnotationOptions {
    readonly points: readonly PdfPoint[];
}
export declare class AnnotationPolygon extends GeometricAnnotationBuilder {
    readonly points: readonly PdfPoint[];
    constructor({ points, ...options }: PointAnnotationOptions, shape?: 'polygon' | 'polyline');
    build(context: RenderContext, rect: AnnotationRect): void;
}
export interface InkAnnotationBuilderOptions extends GeometricAnnotationOptions {
    readonly points: readonly (readonly PdfPoint[])[];
}
export declare class AnnotationInk extends GeometricAnnotationBuilder {
    readonly points: readonly (readonly PdfPoint[])[];
    constructor({ points, ...options }: InkAnnotationBuilderOptions);
    build(context: RenderContext, rect: AnnotationRect): void;
}
export interface ShapeAnnotationOptions extends GeometricAnnotationOptions {
    readonly child?: AnyWidget | null;
}
export declare class SquareAnnotation extends Annotation {
    constructor({ child, color, interiorColor, border, ...options }?: ShapeAnnotationOptions);
}
export declare class CircleAnnotation extends Annotation {
    constructor({ child, color, interiorColor, border, ...options }?: ShapeAnnotationOptions);
}
export interface PolygonAnnotationOptions extends PointAnnotationOptions {
    readonly child?: AnyWidget | null;
}
export declare class PolygonAnnotation extends Annotation {
    constructor({ points, child, color, interiorColor, border, ...options }: PolygonAnnotationOptions);
}
export declare class PolyLineAnnotation extends Annotation {
    constructor({ points, color, border, ...options }: PointAnnotationOptions);
}
export interface InkAnnotationOptions extends InkAnnotationBuilderOptions {
    readonly child?: AnyWidget | null;
}
export declare class InkAnnotation extends Annotation {
    constructor({ points, child, color, border, ...options }: InkAnnotationOptions);
}
export interface OutlineOptions extends AnchorOptions {
    readonly title: string;
    readonly level?: number;
    readonly color?: ColorInput | null;
    readonly style?: PdfOutlineStyle;
}
/** A named destination that also inserts a node in the document outline. */
export declare class Outline extends Anchor {
    readonly title: string;
    readonly level: number;
    readonly color: Rgb | null;
    readonly style: PdfOutlineStyle;
    constructor({ title, level, color, style, ...anchor }: OutlineOptions);
    paint(context: RenderContext, box: PositionedBox<AnnotationLayoutData>): void;
}
export {};
