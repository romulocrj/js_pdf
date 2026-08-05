import type { PdfBlendMode } from '../pdf/graphic_state.ts';
import type { PdfLineCap, PdfLineJoin } from '../pdf/graphics.ts';
import { SvgColor } from './color.ts';
import { SvgNumeric } from './parser.ts';
import type { SvgParser } from './parser.ts';
import type { XmlElement } from './xml.ts';
export type SvgTextAnchor = 'start' | 'middle' | 'end';
export interface SvgBrushFields {
    readonly color: SvgColor | null;
    readonly opacity: number | null;
    readonly fill: SvgColor | null;
    readonly fillEvenOdd: boolean | null;
    readonly fillOpacity: number | null;
    readonly stroke: SvgColor | null;
    readonly strokeOpacity: number | null;
    readonly strokeWidth: SvgNumeric | null;
    readonly strokeDashArray: readonly number[] | null;
    readonly strokeDashOffset: number | null;
    readonly strokeLineCap: PdfLineCap | null;
    readonly strokeLineJoin: PdfLineJoin | null;
    readonly strokeMiterLimit: number | null;
    readonly fontSize: SvgNumeric | null;
    readonly fontFamily: string | null;
    readonly fontStyle: string | null;
    readonly fontWeight: string | null;
    readonly textAnchor: SvgTextAnchor | null;
    readonly blendMode: PdfBlendMode | null;
}
export declare class SvgBrush implements SvgBrushFields {
    readonly color: SvgColor | null;
    readonly opacity: number | null;
    readonly fill: SvgColor | null;
    readonly fillEvenOdd: boolean | null;
    readonly fillOpacity: number | null;
    readonly stroke: SvgColor | null;
    readonly strokeOpacity: number | null;
    readonly strokeWidth: SvgNumeric | null;
    readonly strokeDashArray: readonly number[] | null;
    readonly strokeDashOffset: number | null;
    readonly strokeLineCap: PdfLineCap | null;
    readonly strokeLineJoin: PdfLineJoin | null;
    readonly strokeMiterLimit: number | null;
    readonly fontSize: SvgNumeric | null;
    readonly fontFamily: string | null;
    readonly fontStyle: string | null;
    readonly fontWeight: string | null;
    readonly textAnchor: SvgTextAnchor | null;
    readonly blendMode: PdfBlendMode | null;
    constructor(fields: SvgBrushFields);
    /** What an SVG paints with before any attribute is read. */
    static readonly defaultContext: SvgBrush;
    /**
     * `other` over `this`, following SVG's inheritance rules.
     *
     * `opacity` and `blendMode` are the two that do **not** inherit: an element
     * that states neither is fully opaque and blends normally, whatever its
     * parent does. That is the specification, and it is why they read
     * `other.opacity ?? 1` rather than `?? this.opacity`.
     */
    merge(other: SvgBrush | null): SvgBrush;
    copyWith(fields: Partial<SvgBrushFields>): SvgBrush;
    /**
     * Read `element`'s presentation attributes over `parent`'s.
     *
     * `convertStyle` runs first and **mutates the element**, flattening its
     * `style` attribute into real attributes so nothing below has to know CSS.
     */
    static fromXml(element: XmlElement, parent: SvgBrush, parser: SvgParser): SvgBrush;
}
