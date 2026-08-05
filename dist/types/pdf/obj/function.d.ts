import type { Rgb } from '../color.ts';
import { PdfDict } from '../format/dict.ts';
export declare class PdfBaseFunction {
    static colorsAndStops(colors: readonly Rgb[], stops?: readonly number[]): PdfDict;
}
