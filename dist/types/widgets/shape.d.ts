import type { ColorInput } from '../pdf/color.ts';
import type { PdfFont } from '../pdf/font/font.ts';
import type { PdfPoint } from '../pdf/rect.ts';
import { Widget } from './widget.ts';
import type { Constraints, LayoutBox, PositionedBox, RenderContext } from './widget.ts';
export interface VectorRect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly fill?: ColorInput | null;
    readonly stroke?: ColorInput | null;
    readonly lineWidth?: number;
}
export interface VectorLine {
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
    readonly color?: ColorInput;
    readonly lineWidth?: number;
}
export interface VectorCircle {
    readonly cx: number;
    readonly cy: number;
    readonly radius: number;
    readonly fill?: ColorInput | null;
    readonly stroke?: ColorInput | null;
    readonly lineWidth?: number;
}
export interface VectorText {
    readonly value: string;
    readonly x: number;
    readonly y: number;
    readonly fontSize?: number;
    readonly color?: ColorInput;
    /** Defaults to the document's font, matching `Text`. */
    readonly font?: PdfFont;
}
/** The drawing surface handed to `Vector`'s `draw` callback. */
export interface VectorApi {
    rect(options: VectorRect): void;
    line(options: VectorLine): void;
    circle(options: VectorCircle): void;
    text(options: VectorText): void;
}
export interface VectorOptions {
    readonly width: number;
    readonly height: number;
    readonly draw: (api: VectorApi) => void;
}
export interface VectorLayoutData {
    readonly scale: number;
}
export declare class Vector extends Widget<VectorLayoutData> {
    readonly width: number;
    readonly height: number;
    readonly draw: (api: VectorApi) => void;
    constructor({ width, height, draw }: VectorOptions);
    layout(_context: RenderContext, constraints: Constraints): LayoutBox<VectorLayoutData>;
    paint(context: RenderContext, box: PositionedBox<VectorLayoutData>): void;
}
export interface PaintedShapeOptions {
    readonly fillColor?: ColorInput | null;
    readonly strokeColor?: ColorInput | null;
    readonly strokeWidth?: number;
}
declare abstract class PaintedShape extends Widget<null> {
    readonly fillColor: ColorInput | null;
    readonly strokeColor: ColorInput | null;
    readonly strokeWidth: number;
    constructor({ fillColor, strokeColor, strokeWidth }?: PaintedShapeOptions);
    layout(_context: RenderContext, constraints: Constraints): LayoutBox<null>;
}
/** An ellipse that fills the widget's box. */
export declare class Circle extends PaintedShape {
    paint(context: RenderContext, box: PositionedBox<null>): void;
}
/** A rectangle that fills the widget's box. */
export declare class Rectangle extends PaintedShape {
    paint(context: RenderContext, box: PositionedBox<null>): void;
}
export interface PolygonOptions extends PaintedShapeOptions {
    readonly points: readonly PdfPoint[];
    readonly close?: boolean;
}
/** A polygon whose points use widget-local, top-left coordinates. */
export declare class Polygon extends PaintedShape {
    readonly points: readonly PdfPoint[];
    readonly close: boolean;
    constructor({ points, close, ...options }: PolygonOptions);
    paint(context: RenderContext, box: PositionedBox<null>): void;
}
export interface InkListOptions {
    readonly points: readonly (readonly PdfPoint[])[];
    readonly strokeColor?: ColorInput | null;
    readonly strokeWidth?: number;
}
/** One or more freehand strokes in widget-local, top-left coordinates. */
export declare class InkList extends Widget<null> {
    readonly points: readonly (readonly PdfPoint[])[];
    readonly strokeColor: ColorInput | null;
    readonly strokeWidth: number;
    constructor({ points, strokeColor, strokeWidth }: InkListOptions);
    layout(_context: RenderContext, constraints: Constraints): LayoutBox<null>;
    paint(context: RenderContext, box: PositionedBox<null>): void;
}
export {};
