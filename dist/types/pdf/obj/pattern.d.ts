import { PdfDict } from '../format/dict.ts';
import type { PdfMatrix } from '../matrix.ts';
import type { PdfShading } from './shading.ts';
export interface PdfShadingPatternOptions {
    readonly shading: PdfShading;
    readonly matrix?: PdfMatrix | null;
}
export declare class PdfShadingPattern {
    readonly shading: PdfShading;
    readonly matrix: PdfMatrix | null;
    constructor({ shading, matrix }: PdfShadingPatternOptions);
    output(): PdfDict;
    get key(): string;
}
