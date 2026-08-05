import type { SerializedPage } from '../pdf/document.ts';
import type { ColorInput } from '../pdf/color.ts';
import type { PageSize } from '../pdf/page_format.ts';
import type { Insets, InsetsInput } from './geometry.ts';
import type { AnyWidget, DocumentContext, RenderContext } from './widget.ts';
/** A `Page` or a `MultiPage`: anything a `Document` can render. */
export interface Section {
    render(documentContext: DocumentContext): SerializedPage[];
}
export interface PageOptions {
    readonly format?: PageSize;
    readonly margin?: InsetsInput;
    readonly build: (context: RenderContext) => AnyWidget;
    readonly background?: ColorInput | null;
}
/**
 * A single physical page. Content that does not fit is an error — use
 * `MultiPage` to paginate.
 */
export declare class Page implements Section {
    readonly format: PageSize;
    readonly margin: Insets;
    readonly build: (context: RenderContext) => AnyWidget;
    readonly background: ColorInput | null;
    constructor({ format, margin, build, background }: PageOptions);
    render(documentContext: DocumentContext): SerializedPage[];
}
