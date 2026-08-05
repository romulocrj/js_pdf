import { PageFormat } from './pdf/page_format.ts';
import { PdfType1Font } from './pdf/font/type1_fonts.ts';
import { Align, Center, Divider, Padding, SizedBox } from './widgets/basic.ts';
import { Container } from './widgets/container.ts';
import { Document } from './widgets/document.ts';
import { Column, Row, Spacer } from './widgets/flex.ts';
import { Alignment, EdgeInsets } from './widgets/geometry.ts';
import { MultiPage } from './widgets/multi_page.ts';
import { Page } from './widgets/page.ts';
import type { Section } from './widgets/page.ts';
import { Vector } from './widgets/shape.ts';
import { Text } from './widgets/text.ts';
import { StatelessWidget, Widget } from './widgets/widget.ts';
import type { DocumentOptions } from './widgets/document.ts';
export { Align, Alignment, Center, Column, Container, Divider, Document, EdgeInsets, MultiPage, Padding, Page, PageFormat, PdfType1Font, Row, SizedBox, Spacer, StatelessWidget, Text, Vector, Widget };
export type { ColorInput, Rgb } from './pdf/color.ts';
export type { PdfFont } from './pdf/font/font.ts';
export type { PdfFontMetricsOptions } from './pdf/font/font_metrics.ts';
export { PdfFontMetrics } from './pdf/font/font_metrics.ts';
export type { PageSize } from './pdf/page_format.ts';
export type { TextStyle } from './pdf/graphics.ts';
export type { PdfCanvas } from './pdf/graphics.ts';
export type { Insets, InsetsInput, Offset } from './widgets/geometry.ts';
export type { AnyLayoutBox, AnyWidget, Constraints, DocumentContext, LayoutBox, PositionedBox, RenderContext, StatelessLayoutData } from './widgets/widget.ts';
export type { AlignLayoutData, AlignOptions, CenterOptions, DividerOptions, PaddingOptions, SingleChildLayoutData, SizedBoxOptions } from './widgets/basic.ts';
export type { ColumnOptions, RowOptions } from './widgets/flex.ts';
export type { ContainerOptions } from './widgets/container.ts';
export type { TextAlign, TextOptions } from './widgets/text.ts';
export type { VectorApi, VectorOptions } from './widgets/shape.ts';
export type { PageOptions, Section } from './widgets/page.ts';
export type { MultiPageOptions } from './widgets/multi_page.ts';
export type { DocumentOptions } from './widgets/document.ts';
/** The widget constructors handed to a `createPdf` build callback. */
export interface PublicApi {
    readonly Document: typeof Document;
    readonly Page: typeof Page;
    readonly MultiPage: typeof MultiPage;
    readonly Text: typeof Text;
    readonly Column: typeof Column;
    readonly Row: typeof Row;
    readonly Container: typeof Container;
    readonly Spacer: typeof Spacer;
    readonly Vector: typeof Vector;
    readonly Padding: typeof Padding;
    readonly Align: typeof Align;
    readonly Center: typeof Center;
    readonly SizedBox: typeof SizedBox;
    readonly Divider: typeof Divider;
    readonly Alignment: typeof Alignment;
    readonly EdgeInsets: typeof EdgeInsets;
    readonly PageFormat: typeof PageFormat;
    readonly PdfType1Font: typeof PdfType1Font;
}
/**
 * Build and serialize a document in one call. `build` receives the widget
 * constructors, so a host script never needs module resolution of its own.
 */
export declare function createPdf(options: DocumentOptions, build: (api: PublicApi) => Section | Section[]): Uint8Array;
/** Namespace object, for hosts that prefer a single binding. */
export declare const js_pdf: Readonly<{
    Document: typeof Document;
    Page: typeof Page;
    MultiPage: typeof MultiPage;
    Text: typeof Text;
    Column: typeof Column;
    Row: typeof Row;
    Container: typeof Container;
    Spacer: typeof Spacer;
    Vector: typeof Vector;
    Padding: typeof Padding;
    Align: typeof Align;
    Center: typeof Center;
    SizedBox: typeof SizedBox;
    Divider: typeof Divider;
    Alignment: typeof Alignment;
    EdgeInsets: typeof EdgeInsets;
    PageFormat: typeof PageFormat;
    PdfType1Font: typeof PdfType1Font;
    createPdf: typeof createPdf;
}>;
