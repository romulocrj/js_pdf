import { PdfDict } from '../format/dict.ts';
export type PdfBorderStyle = 'solid' | 'dashed' | 'beveled' | 'inset' | 'underlined';
export interface PdfBorderOptions {
    readonly width?: number;
    readonly style?: PdfBorderStyle;
    readonly dash?: readonly number[] | null;
}
/** Direct border dictionary, resolved with the annotation rather than a registry. */
export declare class PdfBorder implements PdfBorderOptions {
    readonly width: number;
    readonly style: PdfBorderStyle;
    readonly dash: readonly number[] | null;
    constructor({ width, style, dash }?: PdfBorderOptions);
    output(): PdfDict;
}
