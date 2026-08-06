import type { ColorInput } from '../pdf/color.ts';
import type { SerializedPage } from '../pdf/document.ts';
import type { PageSize } from '../pdf/page_format.ts';
import type { Insets, InsetsInput } from './geometry.ts';
import { PageTheme } from './page_theme.ts';
import type { PageOrientation } from './page_theme.ts';
import type { Section } from './page.ts';
import type { ThemeData } from './theme.ts';
import type { AnyWidget, DocumentContext, RenderContext } from './widget.ts';
export interface MultiPageOptions {
    /** Everything about each physical page but its body. */
    readonly pageTheme?: PageTheme;
    readonly format?: PageSize;
    /** Upstream's name for the same option. */
    readonly pageFormat?: PageSize;
    readonly margin?: InsetsInput;
    /**
     * `'portrait'` or `'landscape'` forces the paper's orientation for this
     * section only, so a landscape table can sit between portrait sections of the
     * same document. See the note on `Section` in `page.ts`.
     */
    readonly orientation?: PageOrientation;
    /** The styles this section's widgets inherit; defaults to the document's. */
    readonly theme?: ThemeData;
    readonly gap?: number;
    readonly build: (context: RenderContext) => AnyWidget[];
    readonly header?: ((context: RenderContext) => AnyWidget) | null;
    readonly footer?: ((context: RenderContext) => AnyWidget) | null;
    readonly background?: ColorInput | null;
    readonly maxPages?: number;
}
export declare class MultiPage implements Section {
    /**
     * Everything about the paper, so orientation resolves exactly as it does for
     * a `Page`: `format` and `margin` below are the *resolved* values, rotated
     * with the paper when the orientation disagrees with the declared format.
     */
    readonly pageTheme: PageTheme;
    readonly gap: number;
    readonly theme: ThemeData | null;
    readonly build: (context: RenderContext) => AnyWidget[];
    readonly header: ((context: RenderContext) => AnyWidget) | null;
    readonly footer: ((context: RenderContext) => AnyWidget) | null;
    readonly background: ColorInput | null;
    readonly maxPages: number;
    private renderedPages;
    constructor({ pageTheme, format, pageFormat, margin, orientation, gap, theme, build, header, footer, background, maxPages }: MultiPageOptions);
    /** The paper as written, with the orientation applied. */
    get format(): PageSize;
    /** Margins in the resolved orientation, rotated with the paper. */
    get margin(): Insets;
    render(documentContext: DocumentContext): SerializedPage[];
    postProcess(documentContext: DocumentContext): SerializedPage[];
    private serialize;
    private paintLayer;
}
