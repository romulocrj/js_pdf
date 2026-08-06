/*
 * Ported to JavaScript from DavBfr/dart_pdf.
 *
 * Original work:
 * Copyright (C) 2017, David PHAM-VAN <dev.nfet.net@gmail.com>
 *
 * JavaScript port:
 * Copyright (C) 2026, Romulo Campos
 *
 * This file has been substantially modified from the original Dart source.
 *
 * Licensed under the Apache License, Version 2.0.
 *
 * Original Dart sources ported into this file:
 *   - pdf/lib/src/widgets/text.dart
 *   - pdf/lib/src/widgets/text_style.dart
 *
 * The upstream widget saves mutable span offsets between layout and paint. This
 * port carries every measured run in the returned layout box instead, and its
 * page continuation is an immutable line index. That keeps repeated layout and
 * MultiPage pagination deterministic.
 *
 * PORT GAP: Arabic shaping and the Unicode bidi algorithm depend on the still
 * unported `pdf/font/arabic.dart` and `pdf/font/bidi_utils.dart`. Explicit RTL
 * direction and start/end alignment are supported by mirroring laid-out runs.
 */

import { assertFiniteNumber } from '../base/assert.ts';
import { normalizeColor } from '../pdf/color.ts';
import type { ColorInput, Rgb } from '../pdf/color.ts';
import type { PdfFont } from '../pdf/font/font.ts';
import { defaultPdfFont } from '../pdf/font/type1_fonts.ts';
import { BoxConstraints, normalizeInsets } from './geometry.ts';
import type { Insets, InsetsInput } from './geometry.ts';
import { DEFAULT_FONT_SIZE, DEFAULT_LINE_HEIGHT, TextStyle } from './text_style.ts';
import type { TextDecorationName } from './text_style.ts';
import { SpanningWidget } from './widget.ts';
import type {
  AnyLayoutBox,
  AnyWidget,
  Constraints,
  LayoutBox,
  PositionedBox,
  RenderContext,
  SpanLayout
} from './widget.ts';

export { DEFAULT_FONT_SIZE, DEFAULT_LINE_HEIGHT };

export type TextAlign = 'left' | 'right' | 'start' | 'end' | 'center' | 'justify';
export type TextDirection = 'ltr' | 'rtl';
export type TextOverflow = 'clip' | 'visible' | 'span';

export interface InlineSpanOptions {
  readonly style?: TextStyle | null;
  readonly baseline?: number;
  /** Retained for source compatibility; phase 5.3 supplies annotation painters. */
  readonly annotation?: unknown;
}

export type InlineSpanVisitor = (
  span: InlineSpan,
  style: TextStyle,
  annotation: unknown
) => boolean;

/** Immutable node in a styled inline tree. */
export abstract class InlineSpan {
  readonly style: TextStyle | null;
  readonly baseline: number;
  readonly annotation: unknown;

  constructor({ style = null, baseline = 0, annotation = null }: InlineSpanOptions = {}) {
    this.style = style;
    this.baseline = assertFiniteNumber(Number(baseline), 'baseline');
    this.annotation = annotation;
  }

  abstract copyWith(options?: InlineSpanOptions): InlineSpan;

  abstract visitChildren(
    visitor: InlineSpanVisitor,
    parentStyle: TextStyle,
    annotation?: unknown
  ): boolean;

  toPlainText(): string {
    let value = '';
    this.visitChildren((span) => {
      if (span instanceof TextSpan && span.text !== null) value += span.text;
      return true;
    }, TextStyle.defaultStyle());
    return value;
  }
}

export interface TextSpanOptions extends InlineSpanOptions {
  readonly text?: string | null;
  readonly children?: readonly InlineSpan[] | null;
}

export class TextSpan extends InlineSpan {
  readonly text: string | null;
  readonly children: readonly InlineSpan[];

  constructor({ text = null, children = null, ...options }: TextSpanOptions = {}) {
    super(options);
    this.text = text === null ? null : String(text);
    this.children = children === null ? [] : [...children];
  }

  override copyWith(options: TextSpanOptions = {}): TextSpan {
    return new TextSpan({
      text: options.text ?? this.text,
      children: options.children ?? this.children,
      style: options.style ?? this.style,
      baseline: options.baseline ?? this.baseline,
      annotation: options.annotation ?? this.annotation
    });
  }

  override visitChildren(
    visitor: InlineSpanVisitor,
    parentStyle: TextStyle,
    annotation: unknown = null
  ): boolean {
    const style = parentStyle.merge(this.style);
    const effectiveAnnotation = this.annotation ?? annotation;
    if (this.text !== null && !visitor(this, style, effectiveAnnotation)) return false;
    for (const child of this.children) {
      if (!child.visitChildren(visitor, style, effectiveAnnotation)) return false;
    }
    return true;
  }
}

export interface WidgetSpanOptions extends InlineSpanOptions {
  readonly child: AnyWidget;
}

export class WidgetSpan extends InlineSpan {
  readonly child: AnyWidget;

  constructor({ child, ...options }: WidgetSpanOptions) {
    super(options);
    this.child = child;
  }

  override copyWith(options: InlineSpanOptions = {}): WidgetSpan {
    return new WidgetSpan({
      child: this.child,
      style: options.style ?? this.style,
      baseline: options.baseline ?? this.baseline,
      annotation: options.annotation ?? this.annotation
    });
  }

  override visitChildren(
    visitor: InlineSpanVisitor,
    parentStyle: TextStyle,
    annotation: unknown = null
  ): boolean {
    return visitor(this, parentStyle.merge(this.style), this.annotation ?? annotation);
  }
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
}

interface WidgetFlowToken {
  readonly kind: 'widget';
  readonly width: number;
  readonly height: number;
  readonly style: ResolvedTextStyle;
  readonly childBox: AnyLayoutBox;
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

function countSpaces(value: string): number {
  let count = 0;
  for (const character of value) if (/\s/u.test(character)) count++;
  return count;
}

function textWidth(style: ResolvedTextStyle, value: string): number {
  return style.font.stringMetrics(value, style.fontSize, style.letterSpacing).advanceWidth
    + countSpaces(value) * style.wordSpacing;
}

function supportsRune(font: PdfFont, codePoint: number): boolean {
  const candidate = font as PdfFont & { readonly isRuneSupported?: (value: number) => boolean };
  return candidate.isRuneSupported?.(codePoint) ?? codePoint <= 0xff;
}

function decorationNames(style: TextStyle): readonly TextDecorationName[] {
  const value = style.decoration ?? 'none';
  const values = Array.isArray(value) ? value : [value as TextDecorationName];
  return values.filter(name => name !== 'none');
}

function resolveStyle(
  context: RenderContext,
  style: TextStyle,
  baseline: number,
  scale: number,
  directFont: PdfFont | null = null
): ResolvedTextStyle {
  const fontSize = (style.fontSize ?? DEFAULT_FONT_SIZE) * scale;
  const declaredFont = style.font;
  const font = directFont ?? (declaredFont === null ? context.document.font : declaredFont.getFont(context));
  return {
    font,
    fontSize,
    color: style.color ?? [0, 0, 0],
    lineAdvance: fontSize * (style.height ?? DEFAULT_LINE_HEIGHT) + (style.lineSpacing ?? 0) * scale,
    letterSpacing: (style.letterSpacing ?? 0) * scale,
    wordSpacing: (style.wordSpacing ?? 0) * scale,
    baseline: baseline * scale,
    background: style.background,
    decorations: decorationNames(style),
    decorationColor: style.decorationColor ?? style.color ?? [0, 0, 0],
    decorationStyle: style.decorationStyle ?? 'solid',
    decorationThickness: style.decorationThickness ?? 1
  };
}

function splitLongWord(value: string, maxWidth: number, style: ResolvedTextStyle): string[] {
  const parts: string[] = [];
  let current = '';
  for (const character of value) {
    const candidate = current + character;
    if (current !== '' && textWidth(style, candidate) > maxWidth) {
      parts.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current !== '') parts.push(current);
  return parts.length === 0 ? [''] : parts;
}

/** Single-style helper kept for compatibility with phase-0 callers. */
export function wrapText(
  value: string,
  maxWidth: number,
  fontSize: number,
  font: PdfFont = defaultPdfFont
): string[] {
  const style: ResolvedTextStyle = {
    font,
    fontSize,
    color: [0, 0, 0],
    lineAdvance: fontSize * DEFAULT_LINE_HEIGHT,
    letterSpacing: 0,
    wordSpacing: 0,
    baseline: 0,
    background: null,
    decorations: [],
    decorationColor: [0, 0, 0],
    decorationStyle: 'solid',
    decorationThickness: 1
  };
  const lines: string[] = [];
  for (const paragraph of String(value).replace(/\r\n?/g, '\n').split('\n')) {
    if (paragraph === '') {
      lines.push('');
      continue;
    }
    let current = '';
    for (const rawWord of paragraph.split(/\s+/u)) {
      const words = textWidth(style, rawWord) <= maxWidth
        ? [rawWord]
        : splitLongWord(rawWord, maxWidth, style);
      for (const word of words) {
        const candidate = current === '' ? word : `${current} ${word}`;
        if (current !== '' && textWidth(style, candidate) > maxWidth) {
          lines.push(current);
          current = word;
        } else {
          current = candidate;
        }
      }
    }
    if (current !== '') lines.push(current);
  }
  return lines.length === 0 ? [''] : lines;
}

interface MutableLine {
  tokens: FlowToken[];
  width: number;
  wrapped: boolean;
  emptyStyle: ResolvedTextStyle;
}

function trimTrailingGaps(line: MutableLine): void {
  while (line.tokens[line.tokens.length - 1]?.kind === 'gap') {
    line.width -= line.tokens.pop()?.width ?? 0;
  }
}

function positionLine(
  line: MutableLine,
  y: number,
  contentWidth: number,
  align: TextAlign,
  direction: TextDirection
): RichTextLineLayout {
  let ascent = line.emptyStyle.fontSize + Math.max(0, line.emptyStyle.baseline);
  let descent = Math.max(0, line.emptyStyle.lineAdvance - line.emptyStyle.fontSize - line.emptyStyle.baseline);
  let minimumHeight = line.emptyStyle.lineAdvance;
  for (const token of line.tokens) {
    minimumHeight = Math.max(minimumHeight, token.style.lineAdvance);
    if (token.kind === 'widget') {
      ascent = Math.max(ascent, token.height + token.style.baseline);
      descent = Math.max(descent, -token.style.baseline);
    } else {
      ascent = Math.max(ascent, token.style.fontSize + token.style.baseline);
      descent = Math.max(descent, token.style.lineAdvance - token.style.fontSize - token.style.baseline);
    }
  }
  const height = Math.max(minimumHeight, ascent + descent);
  const effectiveAlign = align === 'start'
    ? (direction === 'rtl' ? 'right' : 'left')
    : align === 'end'
      ? (direction === 'rtl' ? 'left' : 'right')
      : align;
  let offset = 0;
  if (effectiveAlign === 'right') offset = contentWidth - line.width;
  if (effectiveAlign === 'center') offset = (contentWidth - line.width) / 2;

  const gapCount = line.wrapped && effectiveAlign === 'justify'
    ? line.tokens.filter(token => token.kind === 'gap').length
    : 0;
  const extraPerGap = gapCount === 0 ? 0 : Math.max(0, contentWidth - line.width) / gapCount;
  const paintTokens: FlowToken[] = [];
  for (const token of line.tokens) {
    const previous = paintTokens[paintTokens.length - 1];
    if (
      extraPerGap === 0 && token.kind !== 'widget' && previous !== undefined &&
      previous.kind !== 'widget' && previous.style === token.style
    ) {
      paintTokens[paintTokens.length - 1] = {
        kind: 'text',
        text: previous.text + token.text,
        width: previous.width + token.width,
        style: token.style
      };
    } else {
      paintTokens.push(token);
    }
  }
  let x = offset;
  let accumulatedExtra = 0;
  const runs: RichTextRunLayout[] = [];
  for (const token of paintTokens) {
    let runX = x + accumulatedExtra;
    if (direction === 'rtl') runX = contentWidth - runX - token.width;
    const tokenBaseline = y + ascent - token.style.baseline;
    const tokenY = token.kind === 'widget'
      ? tokenBaseline - token.height
      : tokenBaseline - token.style.fontSize;
    runs.push({
      kind: token.kind,
      text: token.kind === 'widget' ? '' : token.text,
      x: runX,
      y: tokenY,
      width: token.width,
      height: token.kind === 'widget' ? token.height : token.style.lineAdvance,
      baseline: tokenBaseline,
      style: token.style,
      childBox: token.kind === 'widget' ? token.childBox : null
    });
    x += token.width;
    if (token.kind === 'gap') accumulatedExtra += extraPerGap;
  }
  const usedWidth = extraPerGap === 0 ? line.width : contentWidth;
  return { runs, y, width: usedWidth, height, wrapped: line.wrapped };
}

function rebaseLines(lines: readonly RichTextLineLayout[], top: number): RichTextLineLayout[] {
  return lines.map(line => ({
    ...line,
    y: line.y - top,
    runs: line.runs.map(run => ({
      ...run,
      y: run.y - top,
      baseline: run.baseline - top
    }))
  }));
}

export class RichText extends SpanningWidget<RichTextLayoutData, RichTextState> {
  readonly text: InlineSpan;
  readonly textAlign: TextAlign | null;
  readonly textDirection: TextDirection;
  readonly softWrap: boolean | null;
  readonly tightBounds: boolean;
  readonly textScaleFactor: number;
  readonly maxLines: number | null;
  readonly overflow: TextOverflow | null;
  readonly margin: Insets;

  constructor({
    text,
    textAlign = null,
    textDirection = 'ltr',
    softWrap = null,
    tightBounds = false,
    textScaleFactor = 1,
    maxLines = null,
    overflow = null,
    margin = 0
  }: RichTextOptions) {
    super();
    this.text = text;
    this.textAlign = textAlign;
    this.textDirection = textDirection;
    this.softWrap = softWrap;
    this.tightBounds = tightBounds;
    this.textScaleFactor = assertFiniteNumber(Number(textScaleFactor), 'textScaleFactor');
    this.maxLines = maxLines;
    this.overflow = overflow;
    this.margin = normalizeInsets(margin);
  }

  override initialSpanState(): RichTextState {
    return { lineIndex: 0 };
  }

  protected inputTokens(context: RenderContext, maxWidth: number): InputToken[] {
    const result: InputToken[] = [];
    const scale = this.textScaleFactor;
    this.text.visitChildren((span, textStyle) => {
      const baseStyle = resolveStyle(context, textStyle, span.baseline, scale);
      if (span instanceof WidgetSpan) {
        const childBox = span.child.layout(context, new BoxConstraints({
          maxWidth,
          maxHeight: Infinity
        }));
        result.push({
          kind: 'widget',
          width: childBox.width,
          height: childBox.height,
          style: baseStyle,
          childBox
        });
        return true;
      }
      if (!(span instanceof TextSpan) || span.text === null) return true;

      let group = '';
      let groupFont = baseStyle.font;
      const flush = (): void => {
        if (group === '') return;
        const style = groupFont === baseStyle.font
          ? baseStyle
          : { ...baseStyle, font: groupFont };
        for (const part of group.replace(/\r\n?/g, '\n').split(/(\n|[^\S\n]+|[^\s]+)/u)) {
          if (part === '') continue;
          if (part === '\n') result.push({ kind: 'break', style });
          else result.push({
            kind: /^\s+$/u.test(part) ? 'gap' : 'text',
            text: part,
            width: textWidth(style, part),
            style
          });
        }
        group = '';
      };

      for (const character of span.text) {
        const codePoint = character.codePointAt(0) ?? 0;
        let font = baseStyle.font;
        if (!supportsRune(font, codePoint)) {
          for (const fallback of textStyle.fontFallback) {
            const candidate = fallback.getFont(context);
            if (supportsRune(candidate, codePoint)) {
              font = candidate;
              break;
            }
          }
        }
        if (font !== groupFont && group !== '') flush();
        groupFont = font;
        group += character;
      }
      flush();
      return true;
    }, context.theme.defaultTextStyle);
    return result;
  }

  private allLines(context: RenderContext, contentWidth: number, minContentWidth = 0): RichTextLineLayout[] {
    const align = this.textAlign ?? context.theme.textAlign ?? 'left';
    const softWrap = this.softWrap ?? context.theme.softWrap;
    const maxLines = this.maxLines ?? context.theme.maxLines;
    const tokens = this.inputTokens(context, contentWidth);
    const fallbackStyle = resolveStyle(context, context.theme.defaultTextStyle, 0, this.textScaleFactor);
    const raw: MutableLine[] = [];
    let current: MutableLine = { tokens: [], width: 0, wrapped: false, emptyStyle: fallbackStyle };

    const pushLine = (wrapped: boolean): void => {
      trimTrailingGaps(current);
      current.wrapped = wrapped;
      raw.push(current);
      current = { tokens: [], width: 0, wrapped: false, emptyStyle: current.emptyStyle };
    };

    for (const token of tokens) {
      current.emptyStyle = token.style;
      if (token.kind === 'break') {
        pushLine(false);
        continue;
      }
      if (token.kind === 'gap' && current.tokens.length === 0) continue;

      if (softWrap && current.tokens.length > 0 && current.width + token.width > contentWidth + 0.00001) {
        pushLine(true);
        if (token.kind === 'gap') continue;
      }

      if (token.kind === 'text' && softWrap && token.width > contentWidth + 0.00001) {
        const pieces = splitLongWord(token.text, contentWidth, token.style);
        for (let index = 0; index < pieces.length; index++) {
          const piece = pieces[index] ?? '';
          const part = { ...token, text: piece, width: textWidth(token.style, piece) };
          if (current.tokens.length > 0) pushLine(true);
          current.tokens.push(part);
          current.width = part.width;
          if (index < pieces.length - 1) pushLine(true);
        }
        continue;
      }

      current.tokens.push(token);
      current.width += token.width;
    }
    if (current.tokens.length > 0 || raw.length === 0 || tokens[tokens.length - 1]?.kind === 'break') pushLine(false);

    const limited = maxLines === null ? raw : raw.slice(0, Math.max(1, maxLines));
    /*
     * Upstream aligns inside `max(constraints.minWidth, longest line)`, and
     * inside the full width once a line wrapped. A tight-width parent — a table
     * cell, say — therefore gets its text aligned across the whole cell, not
     * across the text's own extent.
     */
    const targetWidth = limited.some(line => line.wrapped || align === 'justify')
      ? contentWidth
      : Math.max(0, minContentWidth, ...limited.map(line => line.width));
    let y = 0;
    const lines: RichTextLineLayout[] = [];
    for (const line of limited) {
      const positioned = positionLine(line, y, targetWidth, align, this.textDirection);
      lines.push(positioned);
      y += positioned.height;
    }
    return lines;
  }

  private fragment(
    context: RenderContext,
    constraints: Constraints,
    lineIndex: number,
    spanning: boolean
  ): SpanLayout<RichTextLayoutData, RichTextState> {
    const parent = BoxConstraints.from(constraints);
    const contentWidth = Math.max(1, parent.maxWidth - this.margin.left - this.margin.right);
    const minContentWidth = Math.max(0, parent.minWidth - this.margin.left - this.margin.right);
    const all = this.allLines(context, contentWidth, minContentWidth);
    const topMargin = lineIndex === 0 ? this.margin.top : 0;
    const availableHeight = Math.max(0, parent.maxHeight - topMargin);
    let end = lineIndex;
    let height = 0;
    while (end < all.length) {
      const nextHeight = all[end]?.height ?? 0;
      const finalBottom = end === all.length - 1 ? this.margin.bottom : 0;
      if (spanning && height + nextHeight + finalBottom > availableHeight + 0.00001) break;
      height += nextHeight;
      end++;
      if (!spanning && height > availableHeight + 0.00001) break;
    }
    if (!spanning) end = all.length;
    const isFinal = end >= all.length;
    const bottomMargin = isFinal ? this.margin.bottom : 0;
    const lineTop = all[lineIndex]?.y ?? 0;
    const selected = rebaseLines(all.slice(lineIndex, end), lineTop - topMargin);
    const widest = Math.max(0, ...selected.map(line => line.width));
    const naturalHeight = topMargin + selected.reduce((sum, line) => sum + line.height, 0) + bottomMargin;
    const size = parent.constrain({
      width: widest + this.margin.left + this.margin.right,
      height: naturalHeight
    });
    const effectiveOverflow = this.overflow ?? context.theme.overflow;
    return {
      box: {
        widget: this,
        width: size.width,
        height: size.height,
        data: {
          lines: selected,
          contentWidth: Math.max(0, size.width - this.margin.left - this.margin.right),
          clip: effectiveOverflow === 'clip' || naturalHeight > size.height + 0.00001
        }
      },
      nextState: { lineIndex: end },
      hasMore: end < all.length
    };
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<RichTextLayoutData> {
    return this.fragment(context, constraints, 0, false).box;
  }

  override layoutSpan(
    context: RenderContext,
    constraints: Constraints,
    state: RichTextState
  ): SpanLayout<RichTextLayoutData, RichTextState> {
    return this.fragment(context, constraints, state.lineIndex, true);
  }

  override paint(context: RenderContext, box: PositionedBox<RichTextLayoutData>): void {
    const { canvas } = context;
    if (box.data.clip) {
      canvas.saveContext();
      canvas.drawRect(box.x, canvas.pageHeight - box.y - box.height, box.width, box.height);
      canvas.clipPath();
    }

    for (const line of box.data.lines) {
      for (const run of line.runs) {
        const x = box.x + this.margin.left + run.x;
        const y = box.y + run.y;
        if (run.style.background !== null && run.width > 0) {
          run.style.background.paint(context, x, y, run.width, run.height, 'all', this.textDirection);
        }
      }
    }

    for (const line of box.data.lines) {
      for (const run of line.runs) {
        const x = box.x + this.margin.left + run.x;
        if (run.kind === 'text') {
          canvas.text(run.text, x, box.y + run.baseline, {
            font: run.style.font,
            fontSize: run.style.fontSize,
            color: run.style.color,
            letterSpacing: run.style.letterSpacing,
            wordSpacing: run.style.wordSpacing
          });
        } else if (run.kind === 'widget' && run.childBox !== null) {
          run.childBox.widget.paint(context, {
            ...run.childBox,
            x,
            y: box.y + run.y
          });
        }
      }
    }

    for (const line of box.data.lines) {
      for (const run of line.runs) {
        if (run.style.decorations.length === 0 || run.width <= 0) continue;
        const x = box.x + this.margin.left + run.x;
        const width = Math.max(0.25, run.style.fontSize * 0.05 * run.style.decorationThickness);
        for (const decoration of run.style.decorations) {
          const top = decoration === 'underline'
            ? box.y + run.baseline + run.style.fontSize * 0.08
            : decoration === 'overline'
              ? box.y + run.baseline - run.style.fontSize
              : box.y + run.baseline - run.style.fontSize * 0.35;
          canvas.line(x, top, x + run.width, top, run.style.decorationColor, width);
          if (run.style.decorationStyle === 'double') {
            const gap = Math.max(width * 2, run.style.fontSize * 0.04);
            canvas.line(x, top + gap, x + run.width, top + gap, run.style.decorationColor, width);
          }
        }
      }
    }

    if (box.data.clip) canvas.restoreContext();
  }
}

export class Text extends RichText {
  readonly value: string;

  constructor(value: string, {
    style = undefined,
    fontSize = undefined,
    lineHeight = undefined,
    color = undefined,
    align = undefined,
    textAlign = undefined,
    textDirection = 'ltr',
    softWrap = undefined,
    tightBounds = false,
    textScaleFactor = 1,
    margin = 0,
    maxLines = undefined,
    overflow = undefined,
    font = undefined
  }: TextOptions = {}) {
    const overrides = new TextStyle({
      color: color === undefined ? null : normalizeColor(color),
      font: font === undefined ? null : undefined,
      fontSize: fontSize === undefined ? null : assertFiniteNumber(Number(fontSize), 'fontSize'),
      height: lineHeight === undefined ? null : assertFiniteNumber(Number(lineHeight), 'lineHeight')
    });
    const merged = (style ?? new TextStyle()).merge(overrides);
    super({
      text: new TextSpan({ text: String(value), style: merged }),
      textAlign: textAlign ?? align ?? null,
      textDirection,
      softWrap: softWrap ?? null,
      tightBounds,
      textScaleFactor,
      maxLines: maxLines ?? null,
      overflow: overflow ?? null,
      margin
    });
    this.value = String(value);
    this.directFont = font ?? null;
  }

  private readonly directFont: PdfFont | null;

  protected override inputTokens(context: RenderContext, maxWidth: number): InputToken[] {
    if (this.directFont === null) return super.inputTokens(context, maxWidth);
    const tokens = super.inputTokens(context, maxWidth);
    return tokens.map(token => ({ ...token, style: { ...token.style, font: this.directFont as PdfFont } }));
  }
}
