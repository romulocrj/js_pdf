import type { PdfCanvas } from '../pdf/graphics.ts';
export interface RadiusInput {
    readonly x: number;
    readonly y?: number;
}
/** A circular or elliptical corner radius. */
export declare class Radius {
    static readonly zero: Radius;
    readonly x: number;
    readonly y: number;
    constructor(x: number, y?: number);
    static circular(radius: number): Radius;
    static elliptical(x: number, y: number): Radius;
    equals(other: Radius): boolean;
}
export type RadiusValue = number | Radius | RadiusInput;
export type TextDirection = 'ltr' | 'rtl';
/** Physical or direction-dependent corner radii. */
export declare abstract class BorderRadiusGeometry {
    abstract get isUniform(): boolean;
    abstract get uniform(): Radius;
    abstract resolve(direction?: TextDirection | null): BorderRadius;
}
export interface BorderRadiusOnlyOptions {
    readonly topLeft?: RadiusValue;
    readonly topRight?: RadiusValue;
    readonly bottomLeft?: RadiusValue;
    readonly bottomRight?: RadiusValue;
}
/** Immutable radii for the four physical corners of a rectangle. */
export declare class BorderRadius extends BorderRadiusGeometry {
    static readonly zero: BorderRadius;
    readonly topLeft: Radius;
    readonly topRight: Radius;
    readonly bottomLeft: Radius;
    readonly bottomRight: Radius;
    constructor({ topLeft, topRight, bottomLeft, bottomRight }?: BorderRadiusOnlyOptions);
    static all(value: RadiusValue): BorderRadius;
    static circular(value: number): BorderRadius;
    static vertical({ top, bottom }?: {
        readonly top?: RadiusValue;
        readonly bottom?: RadiusValue;
    }): BorderRadius;
    static horizontal({ left, right }?: {
        readonly left?: RadiusValue;
        readonly right?: RadiusValue;
    }): BorderRadius;
    static only(options?: BorderRadiusOnlyOptions): BorderRadius;
    get isUniform(): boolean;
    get uniform(): Radius;
    resolve(): BorderRadius;
    /** Append the rounded rectangle path in PDF user space. */
    paint(canvas: PdfCanvas, x: number, top: number, width: number, height: number): void;
}
export interface BorderRadiusDirectionalOnlyOptions {
    readonly topStart?: RadiusValue;
    readonly topEnd?: RadiusValue;
    readonly bottomStart?: RadiusValue;
    readonly bottomEnd?: RadiusValue;
}
/** Direction-aware radii, resolved when decoration is painted. */
export declare class BorderRadiusDirectional extends BorderRadiusGeometry {
    static readonly zero: BorderRadiusDirectional;
    readonly topStart: Radius;
    readonly topEnd: Radius;
    readonly bottomStart: Radius;
    readonly bottomEnd: Radius;
    constructor({ topStart, topEnd, bottomStart, bottomEnd }?: BorderRadiusDirectionalOnlyOptions);
    static all(value: RadiusValue): BorderRadiusDirectional;
    static circular(value: number): BorderRadiusDirectional;
    static vertical({ top, bottom }?: {
        readonly top?: RadiusValue;
        readonly bottom?: RadiusValue;
    }): BorderRadiusDirectional;
    static horizontal({ start, end }?: {
        readonly start?: RadiusValue;
        readonly end?: RadiusValue;
    }): BorderRadiusDirectional;
    static only(options?: BorderRadiusDirectionalOnlyOptions): BorderRadiusDirectional;
    get isUniform(): boolean;
    get uniform(): Radius;
    resolve(direction?: TextDirection | null): BorderRadius;
}
