import type { Rgb } from '../color.ts';
import { PdfDict } from '../format/dict.ts';
export declare class PdfBaseFunction {
    static colorsAndStops(colors: readonly Rgb[], stops?: readonly number[]): PdfDict;
    /**
     * Repeat or reflect one unit-domain function across a finite parameter range.
     * The range is bounded by the painted geometry, so malformed SVG input cannot
     * allocate an unbounded stitching array.
     */
    static spread(fn: PdfDict, start: number, end: number, method: 'repeat' | 'reflect'): PdfDict;
}
