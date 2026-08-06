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
