import { PdfCanvas } from '../graphics.ts';
import type { PdfFormAppearance } from './annotation.ts';
export interface PdfFormXObjectOptions {
    readonly width: number;
    readonly height: number;
    readonly paint: (canvas: PdfCanvas) => void;
}
/** Reusable content snapshot. Paint uses the same coordinates as PdfCanvas. */
export declare class PdfFormXObject {
    readonly appearance: PdfFormAppearance;
    readonly width: number;
    readonly height: number;
    constructor({ width, height, paint }: PdfFormXObjectOptions);
}
