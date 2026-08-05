import type { ColorInput } from '../pdf/color.ts';
import type { SerializedPage } from '../pdf/document.ts';
import type { PageSize } from '../pdf/page_format.ts';
import type { Insets, InsetsInput } from './geometry.ts';
import type { Section } from './page.ts';
import type { ThemeData } from './theme.ts';
import type { AnyWidget, DocumentContext, RenderContext } from './widget.ts';
export interface MultiPageOptions {
    readonly format?: PageSize;
    /** Upstream's name for the same option. */
    readonly pageFormat?: PageSize;
    readonly margin?: InsetsInput;
    /** The styles this section's widgets inherit; defaults to the document's. */
    readonly theme?: ThemeData;
    readonly gap?: number;
    readonly build: (context: DocumentContext) => AnyWidget[];
    readonly header?: ((context: RenderContext) => AnyWidget) | null;
    readonly footer?: ((context: RenderContext) => AnyWidget) | null;
    readonly background?: ColorInput | null;
}
export declare class MultiPage implements Section {
    readonly format: PageSize;
    readonly margin: Insets;
    readonly gap: number;
    readonly theme: ThemeData | null;
    readonly build: (context: DocumentContext) => AnyWidget[];
    readonly header: ((context: RenderContext) => AnyWidget) | null;
    readonly footer: ((context: RenderContext) => AnyWidget) | null;
    readonly background: ColorInput | null;
    constructor({ format, pageFormat, margin, gap, theme, build, header, footer, background }: MultiPageOptions);
    render(documentContext: DocumentContext): SerializedPage[];
}
