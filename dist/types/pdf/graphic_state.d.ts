import { PdfDict } from './format/dict.ts';
/**
 * The separable and non-separable blend modes of PDF 1.4.
 *
 * Upstream is an `enum` whose names it converts to PDF names by capitalizing
 * the first letter of `toString()`. An `enum` is not erasable TypeScript, so
 * this is a string union and the mapping is a table.
 */
export type PdfBlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'colorDodge' | 'colorBurn' | 'hardLight' | 'softLight' | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity';
export interface PdfGraphicStateOptions {
    /** Sets both opacities at once, as upstream's constructor does. */
    readonly opacity?: number | null;
    readonly fillOpacity?: number | null;
    readonly strokeOpacity?: number | null;
    readonly blendMode?: PdfBlendMode | null;
}
export declare class PdfGraphicState {
    readonly fillOpacity: number | null;
    readonly strokeOpacity: number | null;
    readonly blendMode: PdfBlendMode | null;
    constructor({ opacity, fillOpacity, strokeOpacity, blendMode }?: PdfGraphicStateOptions);
    /** Nothing to write: a `gs` selecting this state would be a no-op. */
    get isEmpty(): boolean;
    /** Value identity, standing in for Dart's `operator ==`. */
    get key(): string;
    output(): PdfDict;
}
