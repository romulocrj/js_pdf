import type { Rgb } from '../pdf/color.ts';
import type { PdfCanvas } from '../pdf/graphics.ts';
import { PdfShadingPattern } from '../pdf/obj/pattern.ts';
import { SvgColor } from './color.ts';
import type { SvgOperation } from './operation.ts';
import type { SvgParser } from './parser.ts';
import { SvgTransform } from './transform.ts';
import type { XmlElement } from './xml.ts';
export type SvgGradientUnits = 'objectBoundingBox' | 'userSpaceOnUse';
export type SvgSpreadMethod = 'pad' | 'reflect' | 'repeat';
export declare abstract class SvgGradient extends SvgColor {
    readonly gradientUnits: SvgGradientUnits | null;
    readonly transform: SvgTransform;
    readonly colors: readonly Rgb[];
    readonly stops: readonly number[];
    readonly opacityList: readonly number[];
    readonly spreadMethod: SvgSpreadMethod;
    protected readonly hasSpreadMethod: boolean;
    constructor(gradientUnits: SvgGradientUnits | null, transform: SvgTransform, colors: readonly Rgb[], stops: readonly number[], opacityList: readonly number[], spreadMethod: SvgSpreadMethod | null);
    get isEmpty(): boolean;
    get isNotEmpty(): boolean;
    protected patternMatrix(operation: SvgOperation, canvas: PdfCanvas): import("../index.ts").PdfMatrix;
    protected abstract buildGradient(operation: SvgOperation, canvas: PdfCanvas): PdfShadingPattern;
    setFillColor(operation: SvgOperation, canvas: PdfCanvas): void;
    setStrokeColor(operation: SvgOperation, canvas: PdfCanvas): void;
    static fromReference(value: string, parser: SvgParser): SvgGradient | null;
}
export declare class SvgLinearGradient extends SvgGradient {
    readonly x1: number | null;
    readonly y1: number | null;
    readonly x2: number | null;
    readonly y2: number | null;
    constructor(gradientUnits: SvgGradientUnits | null, x1: number | null, y1: number | null, x2: number | null, y2: number | null, transform: SvgTransform, colors: readonly Rgb[], stops: readonly number[], opacities: readonly number[], spreadMethod: SvgSpreadMethod | null);
    static fromElement(element: XmlElement, parser: SvgParser, seen?: readonly string[]): SvgLinearGradient;
    private static units;
    private static spread;
    mergeWith(other: SvgLinearGradient): SvgLinearGradient;
    protected buildGradient(operation: SvgOperation, canvas: PdfCanvas): PdfShadingPattern;
}
export declare class SvgRadialGradient extends SvgGradient {
    readonly r: number | null;
    readonly cx: number | null;
    readonly cy: number | null;
    readonly fr: number | null;
    readonly fx: number | null;
    readonly fy: number | null;
    constructor(gradientUnits: SvgGradientUnits | null, r: number | null, cx: number | null, cy: number | null, fr: number | null, fx: number | null, fy: number | null, transform: SvgTransform, colors: readonly Rgb[], stops: readonly number[], opacities: readonly number[], spreadMethod: SvgSpreadMethod | null);
    static fromElement(element: XmlElement, parser: SvgParser, seen?: readonly string[]): SvgRadialGradient;
    mergeWith(other: SvgRadialGradient): SvgRadialGradient;
    protected buildGradient(operation: SvgOperation, canvas: PdfCanvas): PdfShadingPattern;
}
