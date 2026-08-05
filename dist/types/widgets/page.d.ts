import type { SerializedPage } from '../pdf/document.ts';
import type { ColorInput } from '../pdf/color.ts';
import type { PageSize } from '../pdf/page_format.ts';
import { PageTheme } from './page_theme.ts';
import type { AnyWidget, DocumentContext, RenderContext } from './widget.ts';
import type { InsetsInput } from './geometry.ts';
import type { ThemeData } from './theme.ts';
/** A `Page` or a `MultiPage`: anything a `Document` can render. */
export interface Section {
    render(documentContext: DocumentContext): SerializedPage[];
}
export interface PageOptions {
    /** Everything about the page but its body. Takes precedence field by field. */
    readonly pageTheme?: PageTheme;
    /** Upstream's name for the paper size. */
    readonly pageFormat?: PageSize;
    /** The port's original name for the same thing, kept for callers using it. */
    readonly format?: PageSize;
    readonly margin?: InsetsInput;
    readonly theme?: ThemeData;
    readonly build: (context: RenderContext) => AnyWidget;
    readonly background?: ColorInput | null;
}
/**
 * A single physical page. Content that does not fit is an error — use
 * `MultiPage` to paginate.
 */
export declare class Page implements Section {
    readonly pageTheme: PageTheme;
    readonly build: (context: RenderContext) => AnyWidget;
    readonly background: ColorInput | null;
    constructor({ pageTheme, pageFormat, format, margin, theme, build, background }: PageOptions);
    get format(): PageSize;
    render(documentContext: DocumentContext): SerializedPage[];
    private paintLayer;
}
