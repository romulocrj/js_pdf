import type { PageSize } from '../pdf/page_format.ts';
import type { Insets, InsetsInput } from './geometry.ts';
import type { ThemeData } from './theme.ts';
import type { AnyWidget, RenderContext } from './widget.ts';
export type PageOrientation = 'natural' | 'landscape' | 'portrait';
export type BuildCallback = (context: RenderContext) => AnyWidget;
export interface PageThemeOptions {
    readonly pageFormat?: PageSize;
    readonly buildBackground?: BuildCallback | null;
    readonly buildForeground?: BuildCallback | null;
    readonly theme?: ThemeData | null;
    readonly orientation?: PageOrientation;
    readonly margin?: InsetsInput | null;
    /** Accepted for API parity; clipping needs the operators from phase 2.1. */
    readonly clip?: boolean;
}
export declare class PageTheme {
    readonly pageFormat: PageSize;
    readonly orientation: PageOrientation;
    readonly buildBackground: BuildCallback | null;
    readonly buildForeground: BuildCallback | null;
    readonly theme: ThemeData | null;
    readonly clip: boolean;
    private readonly declaredMargin;
    constructor({ pageFormat, buildBackground, buildForeground, theme, orientation, margin, clip }?: PageThemeOptions);
    /** Whether the requested orientation disagrees with the paper's own. */
    get mustRotate(): boolean;
    /**
     * The paper as it is actually written.
     *
     * Upstream keeps the declared format and rotates the content stream through
     * the CTM, which the port cannot do until the transform operators land in
     * phase 2.1. Swapping the dimensions produces the same page for a reader; the
     * observable difference is `/MediaBox`, which reports the rotated size rather
     * than the original with rotated content inside it.
     */
    get resolvedFormat(): PageSize;
    /**
     * Margins in the resolved orientation; rotated with the paper.
     *
     * A page states its own, or inherits the format's — `PageFormat.A4` carries
     * upstream's 2 cm, the same as `PdfPageFormat.a4`. The flat fallback is for
     * a bare `{ width, height }` format, which upstream cannot express.
     */
    get margin(): Insets;
    copyWith(options?: PageThemeOptions): PageTheme;
}
