import { PdfDict } from '../format/dict.ts';
import { PdfObject } from './object.ts';
import type { PdfObjectRegistry } from './object.ts';
export type PdfPageLabelStyle = 'arabic' | 'romanUpper' | 'romanLower' | 'lettersUpper' | 'lettersLower';
export interface PdfPageLabelOptions {
    readonly prefix?: string | null;
    readonly style?: PdfPageLabelStyle | null;
    readonly subsequent?: number | null;
}
/** The numbering style beginning at one zero-based physical page index. */
export declare class PdfPageLabel {
    readonly prefix: string | null;
    readonly style: PdfPageLabelStyle | null;
    readonly subsequent: number | null;
    constructor({ prefix, style, subsequent }?: PdfPageLabelOptions);
    static arabic(options?: Omit<PdfPageLabelOptions, 'style'>): PdfPageLabel;
    static romanUpper(options?: Omit<PdfPageLabelOptions, 'style'>): PdfPageLabel;
    static romanLower(options?: Omit<PdfPageLabelOptions, 'style'>): PdfPageLabel;
    static lettersUpper(options?: Omit<PdfPageLabelOptions, 'style'>): PdfPageLabel;
    static lettersLower(options?: Omit<PdfPageLabelOptions, 'style'>): PdfPageLabel;
    toDict(): PdfDict;
    private toRoman;
    private toLetters;
    asString(index?: number): string;
}
/** The catalog number tree behind `/PageLabels`. */
export declare class PdfPageLabels extends PdfObject<PdfDict> {
    readonly labels: Map<number, PdfPageLabel>;
    constructor(document: PdfObjectRegistry);
    pageLabel(index: number): string;
    prepare(): void;
}
