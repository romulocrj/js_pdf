import type { ColorInput } from '../pdf/color.ts';
import type { SerializedPage } from '../pdf/document.ts';
import type { PageSize } from '../pdf/page_format.ts';
import type { Insets, InsetsInput } from './geometry.ts';
import type { Section } from './page.ts';
import type { AnyWidget, DocumentContext, RenderContext } from './widget.ts';
export interface MultiPageOptions {
    readonly format?: PageSize;
    readonly margin?: InsetsInput;
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
    readonly build: (context: DocumentContext) => AnyWidget[];
    readonly header: ((context: RenderContext) => AnyWidget) | null;
    readonly footer: ((context: RenderContext) => AnyWidget) | null;
    readonly background: ColorInput | null;
    constructor({ format, margin, gap, build, header, footer, background }: MultiPageOptions);
    render(documentContext: DocumentContext): SerializedPage[];
}
