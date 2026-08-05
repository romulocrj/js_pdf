import type { Rgb } from '../pdf/color.ts';
import { PdfRect } from '../pdf/rect.ts';
import type { XmlDocument, XmlElement } from './xml.ts';
export type SvgUnit = 'pixels' | 'millimeters' | 'centimeters' | 'inch' | 'em' | 'percent' | 'points' | 'direct';
/**
 * What an `em` length needs to resolve against. Declared structurally rather
 * than importing `SvgBrush`, which is what carries it: the brush is built out
 * of numerics, so importing it here would be a cycle.
 */
export interface SvgFontSizeContext {
    readonly fontSize: SvgNumeric | null;
}
/** A length or a colour component, with the unit it was written in. */
export declare class SvgNumeric {
    readonly value: number;
    readonly unit: SvgUnit;
    readonly brush: SvgFontSizeContext | null;
    constructor(value: number, brush: SvgFontSizeContext | null, unit?: SvgUnit);
    /** `12`, `1.5em`, `-3.5%`. Upstream's `SvgNumeric(String, SvgBrush?)`. */
    static parse(text: string, brush: SvgFontSizeContext | null): SvgNumeric;
    /** A colour component in 0..1: `128` is a byte, `50%` is a half. */
    get colorValue(): number;
    /** A length in PDF points. */
    get sizeValue(): number;
}
export declare function splitNumeric(parameters: string, brush: SvgFontSizeContext | null): SvgNumeric[];
export declare function splitDoubles(parameters: string): number[];
export interface GetDoubleOptions {
    readonly namespace?: string;
    readonly defaultValue?: number | null;
}
export declare function getDouble(element: XmlElement, name: string, { namespace, defaultValue }?: GetDoubleOptions): number | null;
export interface GetNumericOptions {
    readonly namespace?: string;
    readonly defaultValue?: number | null;
}
export declare function getNumeric(element: XmlElement, name: string, brush: SvgFontSizeContext | null, { namespace, defaultValue }?: GetNumericOptions): SvgNumeric | null;
/**
 * Flatten a `style` attribute into real attributes on the same element, so
 * every later lookup can ignore CSS entirely.
 *
 * This mutates the tree, which is why the XML reader has `setAttribute`.
 * Upstream does the same, and with the same consequence: a declaration in
 * `style` **overwrites** the presentation attribute of the same name, which is
 * what CSS specificity requires.
 */
export declare function convertStyle(element: XmlElement): void;
export interface SvgParserOptions {
    readonly xml: XmlDocument;
    /**
     * Overrides every colour in the document. Upstream's way of tinting a
     * monochrome icon without editing its markup.
     */
    readonly colorFilter?: Rgb | null;
}
/**
 * The document as a whole: its intrinsic size, its viewBox and the lookup by
 * `id` that `<use>`, `clip-path` and gradient references all need.
 *
 * Landed in phase 2.5 rather than 2.7 as the roadmap had it, because the paint
 * modules could not be written without `findById` and `colorFilter`. The public
 * `SvgImage` driver followed in phase 2.7.
 */
export declare class SvgParser {
    readonly viewBox: PdfRect;
    readonly width: number | null;
    readonly height: number | null;
    readonly root: XmlElement;
    readonly colorFilter: Rgb | null;
    private constructor();
    static fromXml({ xml, colorFilter }: SvgParserOptions): SvgParser;
    /** The first element anywhere in the document carrying `id`, or null. */
    findById(id: string): XmlElement | null;
}
