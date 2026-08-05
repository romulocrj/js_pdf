import { PdfDict } from '../format/dict.ts';
import type { PdfPoint, PdfRect } from '../rect.ts';
export type PdfShadingType = 'axial' | 'radial';
export interface PdfShadingOptions {
    readonly type: PdfShadingType;
    readonly fn: PdfDict;
    readonly start: PdfPoint;
    readonly end: PdfPoint;
    readonly radius0?: number | null;
    readonly radius1?: number | null;
    readonly boundingBox?: PdfRect | null;
    readonly extendStart?: boolean;
    readonly extendEnd?: boolean;
}
export declare class PdfShading {
    readonly options: PdfShadingOptions;
    constructor(options: PdfShadingOptions);
    output(): PdfDict;
}
