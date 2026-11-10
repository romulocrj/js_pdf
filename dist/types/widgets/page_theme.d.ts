import type { PageSize } from '../pdf/page_format.ts';
import type { TextDirection } from './border_radius.ts';
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
    /** Clip painted page layers and content to the resolved margin rectangle. */
    readonly clip?: boolean;
    /**
     * The page's text direction: what `Directionality.of` returns on it, the
     * side a directional margin starts on, and the side narrower page children
     * are placed against.
     */
    readonly textDirection?: TextDirection | null;
}
export declare class PageTheme {
    readonly pageFormat: PageSize;
    readonly orientation: PageOrientation;
    readonly buildBackground: BuildCallback | null;
    readonly buildForeground: BuildCallback | null;
    readonly theme: ThemeData | null;
    readonly clip: boolean;
    readonly textDirection: TextDirection | null;
    private readonly declaredMargin;
    constructor({ pageFormat, buildBackground, buildForeground, theme, orientation, margin, clip, textDirection }?: PageThemeOptions);
    /** Whether the requested orientation disagrees with the paper's own. */
    get mustRotate(): boolean;
    /**
     * The paper as it is actually written.
     *
     * Upstream keeps the declared format and rotates the content stream through
     * the CTM. The port deliberately swaps the dimensions so readers report the
     * requested physical orientation. The observable difference is `/MediaBox`, which reports the rotated size rather
     * than the original with rotated content inside it.
     */
    get resolvedFormat(): PageSize;
    /**
     * Margins in the resolved orientation; rotated with the paper.
     *
     * A page states its own, or inherits the format's — `PageFormat.A4` carries
     * upstream's 2 cm, the same as `PdfPageFormat.a4`. The flat fallback is for
     * a bare `{ width, height }` format, which upstream cannot express.
     *
     * A directional margin resolves against `textDirection`, and as ltr when
     * there is none, the fallback of `Directionality.of`. Upstream resolved it
     * before testing for rotation, which threw for a theme with no direction
     * (PR #1980, CHANGELOG L74); the port always returns physical edges, so it
     * resolves whenever it has to, with the same ltr default.
     */
    get margin(): Insets;
    copyWith(options?: PageThemeOptions): PageTheme;
}
