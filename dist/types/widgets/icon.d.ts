import type { ColorInput, Rgb } from '../pdf/color.ts';
import type { Font } from './font.ts';
import type { TextDirection } from './text.ts';
import { StatelessWidget } from './widget.ts';
import type { AnyWidget, RenderContext } from './widget.ts';
export interface IconDataOptions {
    readonly matchTextDirection?: boolean;
}
/** A font glyph used as an icon. */
export declare class IconData {
    readonly codePoint: number;
    readonly matchTextDirection: boolean;
    constructor(codePoint: number, { matchTextDirection }?: IconDataOptions);
}
export interface IconThemeDataOptions {
    readonly color?: ColorInput | null;
    readonly opacity?: number | null;
    readonly size?: number | null;
    readonly font?: Font | null;
}
/** Defaults inherited by icon widgets through `ThemeData`. */
export declare class IconThemeData {
    readonly color: Rgb | null;
    readonly opacity: number | null;
    readonly size: number | null;
    readonly font: Font | null;
    constructor({ color, opacity, size, font }?: IconThemeDataOptions);
    static fallback(font?: Font | null): IconThemeData;
    copyWith(options?: IconThemeDataOptions): IconThemeData;
}
export interface IconOptions {
    readonly size?: number | null;
    readonly color?: ColorInput | null;
    readonly textDirection?: TextDirection | null;
    readonly font?: Font | null;
}
/** Draws one glyph from the configured icon font. */
export declare class Icon extends StatelessWidget {
    readonly icon: IconData;
    readonly size: number | null;
    readonly color: Rgb | null;
    readonly textDirection: TextDirection | null;
    readonly font: Font | null;
    constructor(icon: IconData, { size, color, textDirection, font }?: IconOptions);
    build(context: RenderContext): AnyWidget;
}
