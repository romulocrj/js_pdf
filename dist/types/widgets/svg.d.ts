import type { ColorInput } from '../pdf/color.ts';
import { Alignment } from './geometry.ts';
import type { Alignment as AlignmentValue } from './geometry.ts';
import { Font } from './font.ts';
import { Widget } from './widget.ts';
import type { Constraints, LayoutBox, PositionedBox, RenderContext } from './widget.ts';
export type BoxFit = 'fill' | 'contain' | 'cover' | 'fitWidth' | 'fitHeight' | 'none' | 'scaleDown';
export type AlignmentName = keyof typeof Alignment;
export type AlignmentInput = AlignmentValue | AlignmentName;
export type SvgCustomFontLookup = (fontFamily: string, fontStyle: string, fontWeight: string) => Font | null;
export interface SvgFittedSize {
    readonly width: number;
    readonly height: number;
}
export interface SvgImageLayoutData {
    readonly source: SvgFittedSize;
    readonly destination: SvgFittedSize;
    readonly sourceX: number;
    readonly sourceY: number;
}
export interface SvgImageOptions {
    readonly svg: string;
    readonly fit?: BoxFit;
    readonly alignment?: AlignmentInput;
    readonly clip?: boolean;
    readonly width?: number | null;
    readonly height?: number | null;
    readonly colorFilter?: ColorInput | null;
    readonly customFontLookup?: SvgCustomFontLookup | null;
}
export declare class SvgImage extends Widget<SvgImageLayoutData> {
    readonly fit: BoxFit;
    readonly alignment: AlignmentValue;
    readonly clip: boolean;
    readonly width: number | null;
    readonly height: number | null;
    private readonly parser;
    private readonly customFontLookup;
    constructor({ svg, fit, alignment, clip, width, height, colorFilter, customFontLookup }: SvgImageOptions);
    layout(_context: RenderContext, constraints: Constraints): LayoutBox<SvgImageLayoutData>;
    paint(context: RenderContext, box: PositionedBox<SvgImageLayoutData>): void;
}
