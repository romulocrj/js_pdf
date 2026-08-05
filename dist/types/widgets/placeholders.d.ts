import type { ColorInput, Rgb } from '../pdf/color.ts';
import type { BoxFit } from './svg.ts';
import type { TextAlign } from './text.ts';
import type { TextStyle } from './text_style.ts';
import { StatelessWidget, Widget } from './widget.ts';
import type { AnyWidget, Constraints, LayoutBox, PositionedBox, RenderContext } from './widget.ts';
export interface PlaceholderOptions {
    readonly color?: ColorInput;
    readonly strokeWidth?: number;
    readonly fallbackWidth?: number;
    readonly fallbackHeight?: number;
}
/** A crossed box used when a visual resource is deliberately absent. */
export declare class Placeholder extends Widget<null> {
    readonly color: Rgb;
    readonly strokeWidth: number;
    readonly fallbackWidth: number;
    readonly fallbackHeight: number;
    constructor({ color, strokeWidth, fallbackWidth, fallbackHeight }?: PlaceholderOptions);
    layout(_context: RenderContext, constraints: Constraints): LayoutBox<null>;
    paint(context: RenderContext, box: PositionedBox<null>): void;
}
export interface PdfLogoOptions {
    readonly color?: ColorInput;
    readonly fit?: BoxFit;
}
export declare class PdfLogo extends StatelessWidget {
    readonly color: Rgb;
    readonly fit: BoxFit;
    constructor({ color, fit }?: PdfLogoOptions);
    build(): AnyWidget;
}
export interface FlutterLogoOptions {
    readonly fit?: BoxFit;
}
export declare class FlutterLogo extends StatelessWidget {
    readonly fit: BoxFit;
    constructor({ fit }?: FlutterLogoOptions);
    build(): AnyWidget;
}
export interface LoremRandom {
    nextInt(maximum: number): number;
}
export interface LoremTextOptions {
    readonly random?: LoremRandom | null;
}
export declare class LoremText {
    static readonly words: readonly string[];
    readonly random: LoremRandom;
    constructor({ random }?: LoremTextOptions);
    word(): string;
    sentence(length: number): string;
    paragraph(length: number): string;
}
export interface LoremOptions {
    readonly length?: number;
    readonly random?: LoremRandom | null;
    readonly style?: TextStyle | null;
    readonly textAlign?: TextAlign;
    readonly softWrap?: boolean;
    readonly textScaleFactor?: number;
    readonly maxLines?: number | null;
}
export declare class Lorem extends StatelessWidget {
    readonly length: number;
    readonly value: string;
    readonly style: TextStyle | null;
    readonly textAlign: TextAlign;
    readonly softWrap: boolean;
    readonly textScaleFactor: number;
    readonly maxLines: number | null;
    constructor({ length, random, style, textAlign, softWrap, textScaleFactor, maxLines }?: LoremOptions);
    build(): AnyWidget;
}
