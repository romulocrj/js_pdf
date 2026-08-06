import type { ColorInput, Rgb } from '../pdf/color.ts';
import type { PdfFont } from '../pdf/font/font.ts';
import type { Insets, InsetsInput } from './geometry.ts';
import type { AnnotationBuilder } from './annotations.ts';
import { DEFAULT_FONT_SIZE, DEFAULT_LINE_HEIGHT, TextStyle } from './text_style.ts';
import type { TextDecorationName } from './text_style.ts';
import { SpanningWidget } from './widget.ts';
import type { AnyLayoutBox, AnyWidget, Constraints, LayoutBox, PositionedBox, RenderContext, SpanLayout } from './widget.ts';
export { DEFAULT_FONT_SIZE, DEFAULT_LINE_HEIGHT };
export type TextAlign = 'left' | 'right' | 'start' | 'end' | 'center' | 'justify';
export type TextDirection = 'ltr' | 'rtl';
export type TextOverflow = 'clip' | 'visible' | 'span';
export interface InlineSpanOptions {
    readonly style?: TextStyle | null;
    readonly baseline?: number;
    readonly annotation?: AnnotationBuilder | null;
}
export type InlineSpanVisitor = (span: InlineSpan, style: TextStyle, annotation: AnnotationBuilder | null) => boolean;
/** Immutable node in a styled inline tree. */
export declare abstract class InlineSpan {
    readonly style: TextStyle | null;
    readonly baseline: number;
    readonly annotation: AnnotationBuilder | null;
    constructor({ style, baseline, annotation }?: InlineSpanOptions);
    abstract copyWith(options?: InlineSpanOptions): InlineSpan;
    abstract visitChildren(visitor: InlineSpanVisitor, parentStyle: TextStyle, annotation?: AnnotationBuilder | null): boolean;
    toPlainText(): string;
}
export interface TextSpanOptions extends InlineSpanOptions {
    readonly text?: string | null;
    readonly children?: readonly InlineSpan[] | null;
}
export declare class TextSpan extends InlineSpan {
    readonly text: string | null;
    readonly children: readonly InlineSpan[];
    constructor({ text, children, ...options }?: TextSpanOptions);
    copyWith(options?: TextSpanOptions): TextSpan;
    visitChildren(visitor: InlineSpanVisitor, parentStyle: TextStyle, annotation?: AnnotationBuilder | null): boolean;
}
export interface WidgetSpanOptions extends InlineSpanOptions {
    readonly child: AnyWidget;
}
export declare class WidgetSpan extends InlineSpan {
    readonly child: AnyWidget;
    constructor({ child, ...options }: WidgetSpanOptions);
    copyWith(options?: InlineSpanOptions): WidgetSpan;
    visitChildren(visitor: InlineSpanVisitor, parentStyle: TextStyle, annotation?: AnnotationBuilder | null): boolean;
}
export interface RichTextOptions {
    readonly text: InlineSpan;
    readonly textAlign?: TextAlign | null;
    readonly textDirection?: TextDirection;
    readonly softWrap?: boolean | null;
    readonly tightBounds?: boolean;
    readonly textScaleFactor?: number;
    readonly maxLines?: number | null;
    readonly overflow?: TextOverflow | null;
    readonly margin?: InsetsInput;
}
export interface TextOptions {
    readonly style?: TextStyle;
    readonly fontSize?: number;
    readonly lineHeight?: number;
    readonly color?: ColorInput;
    readonly align?: TextAlign;
    readonly textAlign?: TextAlign;
    readonly textDirection?: TextDirection;
    readonly softWrap?: boolean;
    readonly tightBounds?: boolean;
    readonly textScaleFactor?: number;
    readonly margin?: InsetsInput;
    readonly maxLines?: number;
    readonly overflow?: TextOverflow;
    /** Direct font escape hatch retained from the early port. */
    readonly font?: PdfFont;
}
export interface ResolvedTextStyle {
    readonly font: PdfFont;
    readonly fontSize: number;
    readonly color: Rgb;
    readonly lineAdvance: number;
    readonly letterSpacing: number;
    readonly wordSpacing: number;
    readonly baseline: number;
    readonly background: TextStyle['background'];
    readonly decorations: readonly TextDecorationName[];
    readonly decorationColor: Rgb;
    readonly decorationStyle: 'solid' | 'double';
    readonly decorationThickness: number;
}
interface TextFlowToken {
    readonly kind: 'text' | 'gap';
    readonly text: string;
    readonly width: number;
    readonly style: ResolvedTextStyle;
    readonly annotation: AnnotationBuilder | null;
}
interface WidgetFlowToken {
    readonly kind: 'widget';
    readonly width: number;
    readonly height: number;
    readonly style: ResolvedTextStyle;
    readonly childBox: AnyLayoutBox;
    readonly annotation: AnnotationBuilder | null;
}
type FlowToken = TextFlowToken | WidgetFlowToken;
interface BreakToken {
    readonly kind: 'break';
    readonly style: ResolvedTextStyle;
}
type InputToken = FlowToken | BreakToken;
export interface RichTextRunLayout {
    readonly kind: 'text' | 'gap' | 'widget';
    readonly text: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly baseline: number;
    readonly style: ResolvedTextStyle;
    readonly childBox: AnyLayoutBox | null;
    readonly annotation: AnnotationBuilder | null;
}
export interface RichTextLineLayout {
    readonly runs: readonly RichTextRunLayout[];
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly wrapped: boolean;
}
export interface RichTextLayoutData {
    readonly lines: readonly RichTextLineLayout[];
    readonly contentWidth: number;
    readonly clip: boolean;
}
export interface RichTextState {
    readonly lineIndex: number;
}
/** Legacy layout shape retained as an alias for callers that named it. */
export type TextLayoutData = RichTextLayoutData;
/** Single-style helper kept for compatibility with phase-0 callers. */
export declare function wrapText(value: string, maxWidth: number, fontSize: number, font?: PdfFont): string[];
export declare class RichText extends SpanningWidget<RichTextLayoutData, RichTextState> {
    readonly text: InlineSpan;
    readonly textAlign: TextAlign | null;
    readonly textDirection: TextDirection;
    readonly softWrap: boolean | null;
    readonly tightBounds: boolean;
    readonly textScaleFactor: number;
    readonly maxLines: number | null;
    readonly overflow: TextOverflow | null;
    readonly margin: Insets;
    constructor({ text, textAlign, textDirection, softWrap, tightBounds, textScaleFactor, maxLines, overflow, margin }: RichTextOptions);
    initialSpanState(): RichTextState;
    protected inputTokens(context: RenderContext, maxWidth: number): InputToken[];
    private allLines;
    private fragment;
    layout(context: RenderContext, constraints: Constraints): LayoutBox<RichTextLayoutData>;
    layoutSpan(context: RenderContext, constraints: Constraints, state: RichTextState): SpanLayout<RichTextLayoutData, RichTextState>;
    paint(context: RenderContext, box: PositionedBox<RichTextLayoutData>): void;
}
export declare class Text extends RichText {
    readonly value: string;
    constructor(value: string, { style, fontSize, lineHeight, color, align, textAlign, textDirection, softWrap, tightBounds, textScaleFactor, margin, maxLines, overflow, font }?: TextOptions);
    private readonly directFont;
    protected inputTokens(context: RenderContext, maxWidth: number): InputToken[];
}
