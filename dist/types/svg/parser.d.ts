import type { XmlElement } from './xml.ts';
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
