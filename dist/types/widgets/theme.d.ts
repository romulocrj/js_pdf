import type { TextAlign, TextOverflow } from './text.ts';
import { TextStyle } from './text_style.ts';
import type { Font } from './font.ts';
import { IconThemeData } from './icon.ts';
import { Widget } from './widget.ts';
import type { AnyLayoutBox, AnyWidget, Constraints, LayoutBox, PositionedBox, RenderContext } from './widget.ts';
export interface ThemeDataFields {
    readonly defaultTextStyle: TextStyle;
    readonly paragraphStyle: TextStyle;
    readonly header0: TextStyle;
    readonly header1: TextStyle;
    readonly header2: TextStyle;
    readonly header3: TextStyle;
    readonly header4: TextStyle;
    readonly header5: TextStyle;
    readonly bulletStyle: TextStyle;
    readonly tableHeader: TextStyle;
    readonly tableCell: TextStyle;
    readonly softWrap: boolean;
    readonly overflow: TextOverflow;
    readonly textAlign: TextAlign | null;
    readonly maxLines: number | null;
    readonly iconTheme: IconThemeData;
}
export interface ThemeDataOptions {
    readonly defaultTextStyle?: TextStyle;
    readonly paragraphStyle?: TextStyle;
    readonly header0?: TextStyle;
    readonly header1?: TextStyle;
    readonly header2?: TextStyle;
    readonly header3?: TextStyle;
    readonly header4?: TextStyle;
    readonly header5?: TextStyle;
    readonly bulletStyle?: TextStyle;
    readonly tableHeader?: TextStyle;
    readonly tableCell?: TextStyle;
    readonly softWrap?: boolean;
    readonly overflow?: TextOverflow;
    readonly textAlign?: TextAlign | null;
    readonly maxLines?: number | null;
    readonly iconTheme?: IconThemeData;
}
export interface ThemeWithFontOptions {
    readonly base?: Font | null;
    readonly bold?: Font | null;
    readonly italic?: Font | null;
    readonly boldItalic?: Font | null;
    readonly icons?: Font | null;
    readonly fontFallback?: readonly Font[] | null;
}
export declare class ThemeData {
    readonly defaultTextStyle: TextStyle;
    readonly paragraphStyle: TextStyle;
    readonly header0: TextStyle;
    readonly header1: TextStyle;
    readonly header2: TextStyle;
    readonly header3: TextStyle;
    readonly header4: TextStyle;
    readonly header5: TextStyle;
    readonly bulletStyle: TextStyle;
    readonly tableHeader: TextStyle;
    readonly tableCell: TextStyle;
    readonly softWrap: boolean;
    readonly overflow: TextOverflow;
    readonly textAlign: TextAlign | null;
    readonly maxLines: number | null;
    readonly iconTheme: IconThemeData;
    /**
     * Upstream's public constructor is a factory that merges onto
     * `ThemeData.base()`; a TypeScript constructor cannot return a different
     * object, so that shape is `ThemeData.create` and this one takes the complete
     * field set. `withFont` is the constructor callers actually want.
     */
    constructor(fields: ThemeDataFields);
    /** Every style derived from one set of faces — the usual entry point. */
    static withFont({ base, bold, italic, boldItalic, icons, fontFallback }?: ThemeWithFontOptions): ThemeData;
    /** The theme a document uses when it names none: Helvetica in four faces. */
    static base(): ThemeData;
    /** Upstream's `ThemeData({...})` factory: overrides merged onto the base. */
    static create(options?: ThemeDataOptions): ThemeData;
    copyWith(options?: ThemeDataOptions): ThemeData;
}
/** What a theme-scoping widget hands from `layout` to `paint`. */
export interface ThemeLayoutData {
    readonly childBox: AnyLayoutBox;
}
/**
 * Base of the widgets that replace the theme for their subtree. The child is
 * laid out and painted with a context carrying `themeFor(context)`, so nothing
 * below sees the outer theme and nothing above sees the inner one.
 */
declare abstract class InheritedTheme extends Widget<ThemeLayoutData> {
    readonly child: AnyWidget;
    constructor(child: AnyWidget);
    protected abstract themeFor(context: RenderContext): ThemeData;
    private scope;
    layout(context: RenderContext, constraints: Constraints): LayoutBox<ThemeLayoutData>;
    paint(context: RenderContext, box: PositionedBox<ThemeLayoutData>): void;
}
export interface ThemeOptions {
    readonly data: ThemeData;
    readonly child: AnyWidget;
}
export declare class Theme extends InheritedTheme {
    readonly data: ThemeData;
    constructor({ data, child }: ThemeOptions);
    /** The theme in force at `context`. */
    static of(context: RenderContext): ThemeData;
    protected themeFor(): ThemeData;
}
export interface DefaultTextStyleOptions {
    readonly style: TextStyle;
    readonly child: AnyWidget;
    readonly textAlign?: TextAlign | null;
    readonly softWrap?: boolean;
    readonly overflow?: TextOverflow | null;
    readonly maxLines?: number | null;
}
/**
 * Replace the default text style for a subtree, leaving the rest of the theme
 * alone. `Theme.of` below this widget reports the merged theme.
 */
export declare class DefaultTextStyle extends InheritedTheme {
    readonly style: TextStyle;
    readonly textAlign: TextAlign | null;
    readonly softWrap: boolean;
    readonly overflow: TextOverflow | null;
    readonly maxLines: number | null;
    constructor({ style, child, textAlign, softWrap, overflow, maxLines }: DefaultTextStyleOptions);
    protected themeFor(context: RenderContext): ThemeData;
}
export {};
