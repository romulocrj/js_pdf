import type { ColorInput, Rgb } from '../pdf/color.ts';
import type { PdfOutlineStyle } from '../pdf/obj/outline.ts';
import type { BoxDecorationInput, BoxShape } from './decoration.ts';
import type { InsetsInput } from './geometry.ts';
import type { TextAlign } from './text.ts';
import type { TextStyle } from './text_style.ts';
import { StatelessWidget } from './widget.ts';
import type { AnyWidget, PositionedBox, RenderContext, StatelessLayoutData } from './widget.ts';
export interface HeaderOptions {
    readonly level?: number;
    readonly text?: string | null;
    readonly child?: AnyWidget | null;
    readonly decoration?: BoxDecorationInput | null;
    readonly margin?: InsetsInput;
    readonly padding?: InsetsInput;
    readonly textStyle?: TextStyle | null;
    readonly title?: string | null;
    readonly outlineColor?: ColorInput | null;
    readonly outlineStyle?: PdfOutlineStyle;
}
/** A themed heading that also records a named destination and outline node. */
export declare class Header extends StatelessWidget {
    readonly level: number;
    readonly text: string | null;
    readonly child: AnyWidget | null;
    readonly decoration: BoxDecorationInput | null;
    readonly margin: InsetsInput | undefined;
    readonly padding: InsetsInput | undefined;
    readonly textStyle: TextStyle | null;
    readonly title: string | null;
    readonly outlineColor: Rgb | null;
    readonly outlineStyle: PdfOutlineStyle;
    constructor({ level, text, child, decoration, margin, padding, textStyle, title, outlineColor, outlineStyle }?: HeaderOptions);
    build(context: RenderContext): AnyWidget;
    paint(context: RenderContext, box: PositionedBox<StatelessLayoutData>): void;
}
export interface ParagraphOptions {
    readonly text?: string | null;
    readonly textAlign?: TextAlign;
    readonly style?: TextStyle | null;
    readonly margin?: InsetsInput;
    readonly padding?: InsetsInput;
}
export declare class Paragraph extends StatelessWidget {
    readonly text: string;
    readonly textAlign: TextAlign;
    readonly style: TextStyle | null;
    readonly margin: InsetsInput;
    readonly padding: InsetsInput;
    constructor({ text, textAlign, style, margin, padding }?: ParagraphOptions);
    build(context: RenderContext): AnyWidget;
}
export interface BulletOptions extends ParagraphOptions {
    readonly bulletMargin?: InsetsInput;
    readonly bulletSize?: number;
    readonly bulletShape?: BoxShape;
    readonly bulletColor?: ColorInput;
}
export declare class Bullet extends StatelessWidget {
    readonly text: string | null;
    readonly textAlign: TextAlign;
    readonly style: TextStyle | null;
    readonly margin: InsetsInput;
    readonly padding: InsetsInput;
    readonly bulletMargin: InsetsInput;
    readonly bulletSize: number;
    readonly bulletShape: BoxShape;
    readonly bulletColor: Rgb;
    constructor({ text, textAlign, style, margin, padding, bulletMargin, bulletSize, bulletShape, bulletColor }?: BulletOptions);
    build(context: RenderContext): AnyWidget;
}
export interface TableOfContentOptions {
    readonly indent?: number;
    readonly gap?: number;
    readonly textStyle?: TextStyle | null;
}
/** A visual table generated from real PDF outline destinations. */
export declare class TableOfContent extends StatelessWidget {
    readonly indent: number;
    readonly gap: number;
    readonly textStyle: TextStyle | null;
    constructor({ indent, gap, textStyle }?: TableOfContentOptions);
    build(context: RenderContext): AnyWidget;
}
