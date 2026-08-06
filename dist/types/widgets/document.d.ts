import type { DocumentMetadata, PdfPageMode, SerializedPageLabel } from '../pdf/document.ts';
import type { Rgb } from '../pdf/color.ts';
import type { PdfOutlineStyle } from '../pdf/obj/outline.ts';
import type { PdfFont } from '../pdf/font/font.ts';
import { PdfPageLabel } from '../pdf/obj/page_label.ts';
import { Font } from './font.ts';
import type { Section } from './page.ts';
import { ThemeData } from './theme.ts';
export interface DocumentOptions {
    readonly title?: string | null;
    readonly author?: string | null;
    readonly subject?: string | null;
    readonly creator?: string | null;
    readonly producer?: string | null;
    readonly keywords?: string | null;
    /** Caller-supplied XMP packet, serialized as UTF-8 XML metadata. */
    readonly xmpMetadata?: string | null;
    readonly pageLabels?: readonly SerializedPageLabel[];
    /** The styles pages inherit unless their own `PageTheme` names another. */
    readonly theme?: ThemeData;
    /**
     * The font a widget draws with when it names none of its own — the one-field
     * ancestor of `theme`, kept because it predates it. Setting it is the same as
     * passing `theme: ThemeData.withFont({ base: Font.fromPdfFont(font) })`, and
     * `theme` wins if both are given.
     */
    readonly font?: PdfFont;
    /** Open the viewer's outline pane when the file is opened. */
    readonly pageMode?: PdfPageMode;
}
export interface DocumentOutlineEntry {
    readonly title: string;
    readonly level: number;
    readonly anchor: string;
    page: number;
    y: number;
    readonly color: Rgb | null;
    readonly style: PdfOutlineStyle;
}
export interface DocumentDestinationEntry {
    readonly name: string;
    readonly page: number;
    readonly x: number | null;
    readonly y: number | null;
    readonly zoom: number | null;
}
export declare class Document {
    readonly metadata: DocumentMetadata;
    readonly theme: ThemeData;
    readonly pageMode: PdfPageMode;
    readonly sections: Section[];
    private readonly outlineEntries;
    private readonly destinationEntries;
    private readonly pageLabelEntries;
    private outlineReplay;
    private outlineCursor;
    private outlineRerenderRequested;
    /**
     * One `PdfFont` per declaration, for this document only. An embedded font
     * accumulates the code points it is asked to encode, so the cache cannot be
     * global — two documents sharing a `Font` must not share its subset.
     */
    private readonly fonts;
    /** Used only if the theme's default style somehow names no font at all. */
    private readonly fallbackFont;
    constructor({ title, author, subject, creator, producer, keywords, xmpMetadata, pageLabels, theme, font, pageMode }?: DocumentOptions);
    /** The `PdfFont` `declaration` stands for here, built once. */
    resolveFont(declaration: Font): PdfFont;
    /**
     * The font a widget falls back to when neither it nor the theme resolved one.
     * Reads through the theme so a `Vector` and a `Text` on the same page agree,
     * and therefore share a single `/Font` entry.
     */
    get font(): PdfFont;
    addPage(page: Section): this;
    /** Begin a page-label numbering range at a zero-based physical page index. */
    setPageLabel(pageIndex: number, label: PdfPageLabel): this;
    pageLabel(pageIndex: number): string;
    /** Current first-pass outline data, consumed by `TableOfContent`. */
    get outlines(): readonly DocumentOutlineEntry[];
    requestOutlineRerender(): void;
    registerOutline({ title, level, pageNumber, y, anchor, color, style }: {
        readonly title: string;
        readonly level: number;
        readonly pageNumber: number;
        readonly y: number;
        readonly anchor?: string | null;
        readonly color?: Rgb | null;
        readonly style?: PdfOutlineStyle;
    }): void;
    registerDestination({ name, pageNumber, x, y, zoom }: {
        readonly name: string;
        readonly pageNumber: number;
        readonly x?: number | null;
        readonly y?: number | null;
        readonly zoom?: number | null;
    }): void;
    private renderSections;
    save(): Uint8Array;
}
