/*
 * Ported to JavaScript from https://github.com/DavBfr/dart_pdf
 *
 * Original work:
 * Copyright (C) 2017, David PHAM-VAN <dev.nfet.net@gmail.com>
 *
 * JavaScript port: https://github.com/romulocrj/js_pdf
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
 * Bidirectional text follows UAX #9 as written: a paragraph that is RTL, or
 * holds a strong RTL character, is shaped and given embedding levels once, in
 * logical order and across span boundaries. Lines are broken on those logical
 * tokens and only then reordered (rule L2), line by line. Upstream reorders
 * whole spans before breaking and compensates with a 239-line skeleton pass;
 * the port reuses the bundled UAX #9 levels and reorder segments instead.
 */

import { assertFiniteNumber } from '../base/assert.ts';
import { normalizePaintColor } from '../pdf/color.ts';
import type { ColorInput, PaintColor } from '../pdf/color.ts';
import type { PdfFont } from '../pdf/font/font.ts';
import type { PdfFontBitmap } from '../pdf/font/font.ts';
import { shapeArabicRange } from '../pdf/font/arabic.ts';
import { unicodeBidi } from '../pdf/font/unicode_bidi.ts';
import { defaultPdfFont } from '../pdf/font/type1_fonts.ts';
import { BoxConstraints, normalizeInsets } from './geometry.ts';
import type { Insets, InsetsInput } from './geometry.ts';
import type { AnnotationBuilder } from './annotations.ts';
import { Directionality } from './directionality.ts';
import { Image } from './image.ts';
import { MemoryImage } from './image_provider.ts';
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

/** Ordered segments of one logical line. Omitted whitespace is preserved. */
export type LineSplitter = (line: string) => readonly string[];

/** Syllables which concatenate to the original word; zero/one disables hyphenation. */
export type Hyphenation = (word: string) => readonly string[];

export interface InlineSpanOptions {
  readonly style?: TextStyle | null;
  readonly baseline?: number;
  readonly annotation?: AnnotationBuilder | null;
}

export type InlineSpanVisitor = (
  span: InlineSpan,
  style: TextStyle,
  annotation: AnnotationBuilder | null
) => boolean;

/** Immutable node in a styled inline tree. */
export abstract class InlineSpan {
  readonly style: TextStyle | null;
  readonly baseline: number;
  readonly annotation: AnnotationBuilder | null;

  constructor({ style = null, baseline = 0, annotation = null }: InlineSpanOptions = {}) {
    this.style = style;
    this.baseline = assertFiniteNumber(Number(baseline), 'baseline');
    this.annotation = annotation;
  }

  abstract copyWith(options?: InlineSpanOptions): InlineSpan;

  abstract visitChildren(
    visitor: InlineSpanVisitor,
    parentStyle: TextStyle,
    annotation?: AnnotationBuilder | null
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
    annotation: AnnotationBuilder | null = null
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
    annotation: AnnotationBuilder | null = null
  ): boolean {
    return visitor(this, parentStyle.merge(this.style), this.annotation ?? annotation);
  }
}

export interface RichTextOptions {
  readonly lineSplitter?: LineSplitter | null;
  readonly hyphenation?: Hyphenation | null;
  readonly text: InlineSpan;
  readonly textAlign?: TextAlign | null;
  readonly textDirection?: TextDirection | null;
  readonly softWrap?: boolean | null;
  readonly tightBounds?: boolean;
  readonly textScaleFactor?: number;
  readonly maxLines?: number | null;
  readonly overflow?: TextOverflow | null;
  readonly margin?: InsetsInput;
}

export interface TextOptions {
  readonly lineSplitter?: LineSplitter | null;
  readonly hyphenation?: Hyphenation | null;
  readonly style?: TextStyle;
  readonly fontSize?: number;
  readonly lineHeight?: number;
  readonly color?: ColorInput;
  readonly align?: TextAlign;
  readonly textAlign?: TextAlign;
  readonly textDirection?: TextDirection | null;
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
  readonly color: PaintColor;
  readonly lineAdvance: number;
  readonly lineSpacing: number;
  readonly letterSpacing: number;
  readonly wordSpacing: number;
  readonly baseline: number;
  readonly background: TextStyle['background'];
  readonly decorations: readonly TextDecorationName[];
  readonly decorationColor: PaintColor;
  readonly decorationStyle: 'solid' | 'double';
  readonly decorationThickness: number;
}

interface TextFlowToken {
  readonly kind: 'text' | 'gap';
  readonly text: string;
  readonly width: number;
  readonly style: ResolvedTextStyle;
  readonly annotation: AnnotationBuilder | null;
  /** UAX #9 level of each UTF-16 unit of `text`; absent outside bidi paragraphs. */
  readonly levels?: Uint8Array | null;
  /** Offsets in `text` where a soft hyphen was: hyphenation points. */
  readonly shy?: readonly number[] | undefined;
  /** Offsets in `text` just after a hyphen a too-long word may be cut at (L143). */
  readonly hyphens?: readonly number[] | undefined;
}

interface WidgetFlowToken {
  readonly kind: 'widget';
  readonly width: number;
  readonly height: number;
  readonly style: ResolvedTextStyle;
  readonly childBox: AnyLayoutBox;
  readonly annotation: AnnotationBuilder | null;
  readonly levels?: Uint8Array | null;
}

type FlowToken = TextFlowToken | WidgetFlowToken;

interface BreakToken {
  readonly kind: 'break';
  readonly style: ResolvedTextStyle;
}

type InputToken = FlowToken | BreakToken;

interface TextItem {
  readonly kind: 'span';
  readonly textStyle: TextStyle;
  readonly style: ResolvedTextStyle;
  readonly annotation: AnnotationBuilder | null;
  text: string;
  start: number;
}

interface WidgetItem {
  readonly kind: 'widget';
  readonly token: WidgetFlowToken;
  start: number;
}

interface Paragraph {
  readonly tokens: InputToken[];
  /** The first span's style; null when no span holds text or a widget. */
  readonly style: ResolvedTextStyle | null;
  /** Whether the tokens carry embedding levels to reorder each line by. */
  readonly bidi: boolean;
}

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
  readonly lineSpacing: number;
  readonly wrapped: boolean;
}

export interface RichTextLayoutData {
  readonly lines: readonly RichTextLineLayout[];
  readonly contentWidth: number;
  readonly clip: boolean;
  readonly textDirection: TextDirection;
}

export interface RichTextState {
  readonly lineIndex: number;
}

/** Legacy layout shape retained as an alias for callers that named it. */
export type TextLayoutData = RichTextLayoutData;

/**
 * The advance `value` draws with: `Tc` after every glyph and `Tw` after every
 * U+0020, exactly as the PDF operators apply them. Charging letter spacing
 * per glyph, the trailing one included, lets tokens and spans tile (L155):
 * the line, not each run, drops the spacing after its last glyph.
 */
function textWidth(style: ResolvedTextStyle, value: string): number {
  let glyphs = 0;
  let spaces = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code === 32) spaces++;
    if (code < 0xdc00 || code > 0xdfff) glyphs++;
  }
  return style.font.stringMetrics(value, style.fontSize).advanceWidth
    + glyphs * style.letterSpacing + spaces * style.wordSpacing;
}

function supportsRune(font: PdfFont, codePoint: number): boolean {
  const candidate = font as PdfFont & { readonly isRuneSupported?: (value: number) => boolean };
  return candidate.isRuneSupported?.(codePoint) ?? codePoint <= 0xff;
}

const bitmapProviders = new WeakMap<PdfFontBitmap, MemoryImage>();

function bitmapWidget(bitmap: PdfFontBitmap, fontSize: number): Image {
  let provider = bitmapProviders.get(bitmap);
  if (provider === undefined) {
    provider = new MemoryImage(bitmap.data);
    bitmapProviders.set(bitmap, provider);
  }
  return new Image(provider, {
    width: fontSize * bitmap.width / bitmap.height,
    height: fontSize
  });
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
    lineAdvance: fontSize
      * (font.ascent - font.descent)
      * (style.height ?? DEFAULT_LINE_HEIGHT),
    lineSpacing: (style.lineSpacing ?? 0) * scale,
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

/**
 * Whether a too-long word may be cut just after `code` when `next` follows. As
 * upstream #1980 (L143): after a hyphen, but not before a digit, so `3-4` stays
 * whole, and not before U+2060, which forbids the break. Callers exclude a
 * word-initial hyphen, so `-5` keeps its sign.
 */
function cutsAfter(code: number, next: string): boolean {
  return (code === 0x2d || code === 0x2010) && next !== '' && !/[\d\u2060]/.test(next);
}

function hyphenCuts(value: string): number[] {
  const cuts: number[] = [];
  for (let index = 1; index < value.length; index++) {
    if (cutsAfter(value.charCodeAt(index), value.charAt(index + 1))) cuts.push(index + 1);
  }
  return cuts;
}

/**
 * Cut a word wider than `maxWidth` into lines: after the last hyphen that fits
 * (L143), otherwise at the widest prefix that fits. Like upstream after #1980,
 * hyphens are not break opportunities in ordinary wrapping, which moves a
 * hyphenated word to the next line whole; they only place the cut of a word
 * longer than the line.
 */
function splitLongWord(
  value: string,
  maxWidth: number,
  style: ResolvedTextStyle,
  cuts: readonly number[] = hyphenCuts(value)
): string[] {
  const fits = (text: string): boolean => textWidth(style, text) - style.letterSpacing <= maxWidth;
  const parts: string[] = [];
  let start = 0;
  while (start < value.length) {
    const rest = value.slice(start);
    if (fits(rest)) {
      parts.push(rest);
      break;
    }
    let end = start;
    for (const cut of cuts) {
      if (cut <= start) continue;
      if (!fits(value.slice(start, cut))) break;
      end = cut;
    }
    if (end === start) {
      let current = '';
      for (const character of rest) {
        if (current !== '' && !fits(current + character)) break;
        current += character;
      }
      end = start + current.length;
    }
    parts.push(value.slice(start, end));
    start = end;
  }
  return parts.length === 0 ? [''] : parts;
}

/**
 * Only printable non-space ASCII is safe to bypass the splitter. Hyphens are
 * not break opportunities (L143), so hyphenated words keep the fast path.
 */
function isSingleAsciiWord(value: string): boolean {
  if (value.length === 0) return false;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 0x21 || code > 0x7e) return false;
  }
  return true;
}

/**
 * Whitespace a line may break at: JavaScript's `\s` without the no-break
 * spaces U+00A0, U+2007 and U+202F, which authors use to hold two words
 * together (L141), and without U+FEFF, a default ignorable.
 */
const SPACES = '\\t\\v\\f\\r \\u1680\\u2000-\\u2006\\u2008-\\u200a\\u2028\\u2029\\u205f\\u3000';
const GAP = new RegExp(`^[${SPACES}]+$`);

/**
 * Whitespace runs, plus a zero-width opportunity after U+200B (L145) unless
 * U+2060 follows. Hyphens are not opportunities; see `splitLongWord`.
 */
const WORDS = new RegExp(`([${SPACES}]+)|(?<=\\u200b)(?!\\u2060)`);

/** Strong RTL text, or a control that opens an RTL level: bidi has work to do. */
const RTL = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc\u200f\u202b\u202e\u2067]/;

/** Unicode Default_Ignorable_Code_Point: never measured, never drawn (L139). */
const IGNORABLE = /[\xad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0\ufff0-\ufff8\u{1bca0}-\u{1bca3}\u{1d173}-\u{1d17a}\u{e0000}-\u{e0fff}]/u;

/** Adapt upstream's word-list callback to the port's explicit whitespace tokens. */
function splitLine(line: string, splitter: LineSplitter | null): readonly string[] {
  if (splitter === null) return line.split(WORDS).filter(part => part);
  const parts = splitter(line);
  const result: string[] = [];
  let cursor = 0;
  for (const part of parts) {
    if (part === '') continue;
    const start = line.indexOf(part, cursor);
    if (typeof part !== 'string' || start < 0 || /\S/u.test(line.slice(cursor, start))) {
      throw new RangeError('lineSplitter must return ordered source segments, omitting only whitespace');
    }
    if (start > cursor) result.push(line.slice(cursor, start));
    result.push(part);
    cursor = start + part.length;
  }
  const tail = line.slice(cursor);
  if (/\S/u.test(tail)) throw new RangeError('lineSplitter must preserve all non-whitespace text');
  if (tail !== '') result.push(tail);
  return result;
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
    lineAdvance: fontSize * (font.ascent - font.descent) * DEFAULT_LINE_HEIGHT,
    lineSpacing: 0,
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
  /** Whitespace dropped from the start of the line. */
  blank: number;
  wrapped: boolean;
  emptyStyle: ResolvedTextStyle;
}

function trimTrailingGaps(line: MutableLine): void {
  while (line.tokens[line.tokens.length - 1]?.kind === 'gap') {
    line.width -= line.tokens.pop()?.width ?? 0;
  }
}

/** `token.text[start, end)` plus `suffix`, with its levels and soft hyphens rebased. */
function sliceToken(token: TextFlowToken, start: number, end: number, suffix = ''): TextFlowToken {
  const text = token.text.slice(start, end) + suffix;
  let levels = token.levels;
  if (levels) {
    const sliced = new Uint8Array(text.length);
    sliced.set(levels.subarray(start, end));
    sliced.fill(levels[end - 1] ?? 0, end - start);
    levels = sliced;
  }
  const rebase = (offsets: readonly number[] | undefined): number[] | undefined => {
    const inside = offsets?.filter(offset => offset > start && offset < end).map(offset => offset - start);
    return inside?.length ? inside : undefined;
  };
  return {
    ...token, text, width: textWidth(token.style, text), levels, shy: rebase(token.shy), hyphens: rebase(token.hyphens)
  };
}

/**
 * The widest piece of a word between its cut points, hyphens and soft hyphens,
 * which is its CSS min-content width; a taken soft hyphen draws a hyphen.
 */
function narrowestPiece(token: TextFlowToken): number {
  if (token.hyphens === undefined && token.shy === undefined) return token.width;
  const cuts = [...token.hyphens ?? [], ...token.shy ?? []].sort((a, b) => a - b);
  let widest = 0;
  let start = 0;
  for (const end of [...cuts, token.text.length]) {
    if (end <= start) continue;
    const piece = token.text.slice(start, end) + (token.shy?.includes(end) === true ? '-' : '');
    widest = Math.max(widest, textWidth(token.style, piece));
    start = end;
  }
  return widest;
}

/** The syllables the soft hyphens of a token mark out. */
function softSyllables(text: string, offsets: readonly number[]): string[] {
  const syllables: string[] = [];
  let start = 0;
  for (const offset of offsets) {
    if (offset <= start || offset >= text.length) continue;
    syllables.push(text.slice(start, offset));
    start = offset;
  }
  syllables.push(text.slice(start));
  return syllables;
}

/**
 * UAX #9 L1-L2 for one finished line. Tokens are split where their level
 * changes, the bundled implementation computes the reversals over one
 * skeleton character per piece, and RTL pieces are reversed with mirrored
 * glyphs. Breaking happened on logical order, so line one keeps the first
 * words and the justify gaps, fallback runs and links stay with their text.
 */
function visualOrder(tokens: readonly FlowToken[], base: number): FlowToken[] {
  const bidi = unicodeBidi();
  const pieces: FlowToken[] = [];
  const pieceLevels: number[] = [];
  let skeleton = '';
  for (const token of tokens) {
    const levels = token.levels;
    if (token.kind === 'widget' || !levels) {
      pieces.push(token);
      pieceLevels.push(levels?.[0] ?? base);
      skeleton += '\ufffc';
      continue;
    }
    let start = 0;
    for (let index = 1; index <= token.text.length; index++) {
      if (index < token.text.length && (levels[index] === levels[start]
          || (token.text.charCodeAt(index) & 0xfc00) === 0xdc00)) continue;
      pieces.push(start === 0 && index === token.text.length ? token : sliceToken(token, start, index));
      pieceLevels.push(levels[start] ?? base);
      skeleton += token.kind === 'gap' ? ' ' : 'a';
      start = index;
    }
  }
  const order = pieces.map((_, index) => index);
  const segments = bidi.getReorderSegments(skeleton, {
    levels: Uint8Array.from(pieceLevels),
    paragraphs: [{ start: 0, end: pieces.length - 1, level: base }]
  });
  for (const [first = 0, last = 0] of segments) {
    for (let low = first, high = last; low < high; low++, high--) {
      const swap = order[low] ?? 0;
      order[low] = order[high] ?? 0;
      order[high] = swap;
    }
  }
  return order.map(index => {
    const piece = pieces[index]!;
    if (piece.kind !== 'text' || ((pieceLevels[index] ?? 0) & 1) === 0) return piece;
    let text = '';
    for (const character of piece.text) text = (bidi.getMirroredCharacter(character) ?? character) + text;
    return { ...piece, text };
  });
}

function positionLine(
  line: MutableLine,
  y: number,
  contentWidth: number,
  align: TextAlign,
  direction: TextDirection,
  bidi: boolean
): RichTextLineLayout {
  let lineSpacing = line.emptyStyle.lineSpacing;
  let ascent = line.emptyStyle.fontSize + Math.max(0, line.emptyStyle.baseline);
  let descent = Math.max(
    0,
    line.emptyStyle.lineAdvance + lineSpacing
      - line.emptyStyle.fontSize
      - line.emptyStyle.baseline
  );
  let minimumHeight = line.emptyStyle.lineAdvance + lineSpacing;
  for (const token of line.tokens) {
    lineSpacing = Math.max(lineSpacing, token.style.lineSpacing);
    minimumHeight = Math.max(
      minimumHeight,
      token.style.lineAdvance + token.style.lineSpacing
    );
    if (token.kind === 'widget') {
      ascent = Math.max(ascent, token.height + token.style.baseline);
      descent = Math.max(descent, -token.style.baseline);
    } else {
      ascent = Math.max(ascent, token.style.fontSize + token.style.baseline);
      descent = Math.max(
        descent,
        token.style.lineAdvance + token.style.lineSpacing
          - token.style.fontSize
          - token.style.baseline
      );
    }
  }
  const height = Math.max(minimumHeight, ascent + descent);
  const resolvedAlign = align === 'start'
    ? (direction === 'rtl' ? 'right' : 'left')
    : align === 'end'
      ? (direction === 'rtl' ? 'left' : 'right')
      : align;
  const tokens = bidi ? visualOrder(line.tokens, direction === 'rtl' ? 1 : 0) : line.tokens;
  const gapCount = line.wrapped && resolvedAlign === 'justify'
    ? tokens.filter(token => token.kind === 'gap').length
    : 0;
  const extraPerGap = gapCount === 0 ? 0 : Math.max(0, contentWidth - line.width) / gapCount;
  // A justified line that is not stretched, such as the last, sits at the
  // start. The RTL mirroring this replaced used to provide that.
  const effectiveAlign = resolvedAlign === 'justify' && extraPerGap === 0 && direction === 'rtl'
    ? 'right'
    : resolvedAlign;
  let offset = 0;
  if (effectiveAlign === 'right') offset = contentWidth - line.width;
  if (effectiveAlign === 'center') offset = (contentWidth - line.width) / 2;

  const paintTokens: FlowToken[] = [];
  for (const token of tokens) {
    const previous = paintTokens[paintTokens.length - 1];
    if (
      extraPerGap === 0 && token.kind !== 'widget' && previous !== undefined &&
      previous.kind !== 'widget' && previous.style === token.style &&
      previous.annotation === token.annotation
    ) {
      paintTokens[paintTokens.length - 1] = {
        kind: 'text',
        text: previous.text + token.text,
        width: previous.width + token.width,
        style: token.style,
        annotation: token.annotation
      };
    } else {
      paintTokens.push(token);
    }
  }
  let x = offset;
  let accumulatedExtra = 0;
  const runs: RichTextRunLayout[] = [];
  for (const token of paintTokens) {
    // Already in visual order: an RTL line is not mirrored a second time.
    const runX = x + accumulatedExtra;
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
      childBox: token.kind === 'widget' ? token.childBox : null,
      annotation: token.annotation
    });
    x += token.width;
    if (token.kind === 'gap') accumulatedExtra += extraPerGap;
  }
  // The spacing after the last glyph is not ink; the line width left it out.
  const last = runs[runs.length - 1];
  if (last !== undefined && last.kind === 'text' && last.style.letterSpacing !== 0) {
    runs[runs.length - 1] = { ...last, width: last.width - last.style.letterSpacing };
  }
  const usedWidth = extraPerGap === 0 ? line.width : contentWidth;
  return { runs, y, width: usedWidth, height, lineSpacing, wrapped: line.wrapped };
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
  protected readonly directFont: PdfFont | null = null;
  readonly lineSplitter: LineSplitter | null;
  readonly hyphenation: Hyphenation | null;
  readonly text: InlineSpan;
  readonly textAlign: TextAlign | null;
  readonly textDirection: TextDirection | null;
  readonly softWrap: boolean | null;
  readonly tightBounds: boolean;
  readonly textScaleFactor: number;
  readonly maxLines: number | null;
  readonly overflow: TextOverflow | null;
  readonly margin: Insets;

  constructor({
    lineSplitter = null,
    hyphenation = null,
    text,
    textAlign = null,
    textDirection = null,
    softWrap = null,
    tightBounds = false,
    textScaleFactor = 1,
    maxLines = null,
    overflow = null,
    margin = 0
  }: RichTextOptions) {
    super();
    this.text = text;
    this.lineSplitter = lineSplitter;
    this.hyphenation = hyphenation;
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

  protected inputTokens(context: RenderContext, maxWidth: number): Paragraph {
    const scale = this.textScaleFactor;
    const direction = this.textDirection ?? Directionality.of(context);
    const items: (TextItem | WidgetItem)[] = [];
    let source = '';
    // UAX #9 picks the embedding level from the base direction; it runs for
    // an RTL fragment in an LTR paragraph too (L150).
    let bidi = direction === 'rtl';
    this.text.visitChildren((span, textStyle, annotation) => {
      const style = resolveStyle(context, textStyle, span.baseline, scale, this.directFont);
      if (span instanceof WidgetSpan) {
        const childBox = span.child.layout(context, new BoxConstraints({
          maxWidth,
          maxHeight: Infinity
        }));
        items.push({ kind: 'widget', start: source.length, token: {
          kind: 'widget',
          width: childBox.width,
          height: childBox.height,
          style,
          childBox,
          annotation
        } });
        source += '\ufffc';
      } else if (span instanceof TextSpan && span.text !== null) {
        // CRLF and CR end one line each, before bidi sees them (L140).
        const text = span.text.replace(/\r\n?/g, '\n');
        bidi ||= RTL.test(text);
        items.push({ kind: 'span', textStyle, style, annotation, text, start: source.length });
        source += text;
      }
      return true;
    }, context.theme.defaultTextStyle);

    // Shape and resolve levels once, in logical order, over the whole
    // paragraph: joining and bidi runs cross span boundaries, and the lines are
    // reordered only after they are broken.
    let levels: Uint8Array | null = null;
    if (bidi) {
      const arabic = /[\u0621-\u06d3]/.test(source);
      let shaped = '';
      for (const item of items) {
        const start = item.start;
        item.start = shaped.length;
        if (item.kind === 'widget') shaped += '\ufffc';
        else shaped += item.text = arabic ? shapeArabicRange(source, start, start + item.text.length) : item.text;
      }
      levels = unicodeBidi().getEmbeddingLevels(shaped, direction).levels;
    }

    const result: InputToken[] = [];
    const groupLevels = levels === null ? null : new Uint8Array(levels.length);
    for (const item of items) {
      if (item.kind === 'widget') {
        result.push(levels === null ? item.token : { ...item.token, levels: levels.subarray(item.start, item.start + 1) });
        continue;
      }
      const { style: baseStyle, textStyle, annotation, text } = item;
      let group = '';
      let groupFont = baseStyle.font;
      let kind: 'text' | 'gap' = 'text';
      let shy: number[] = [];
      let hyphens: number[] = [];
      const styles = new Map<PdfFont, ResolvedTextStyle>([[baseStyle.font, baseStyle]]);
      const flush = (): void => {
        if (group === '') return;
        let style = styles.get(groupFont);
        if (style === undefined) {
          style = { ...baseStyle, font: groupFont };
          styles.set(groupFont, style);
        }
        result.push({
          kind,
          text: group,
          width: textWidth(style, group),
          style,
          annotation,
          levels: groupLevels?.slice(0, group.length) ?? null,
          shy: shy.length === 0 ? undefined : shy,
          hyphens: hyphens.length === 0 ? undefined : hyphens
        });
        group = '';
        shy = [];
        hyphens = [];
      };

      const singleWord = this.lineSplitter === null && isSingleAsciiWord(text);
      const lines = singleWord ? [text] : text.split('\n');
      let offset = item.start;
      for (let index = 0; index < lines.length; index++) {
        if (index > 0) {
          result.push({ kind: 'break', style: baseStyle });
          offset++;
        }
        const parts = singleWord ? [text] : splitLine(lines[index] ?? '', this.lineSplitter);
        for (const part of parts) {
          kind = !singleWord && GAP.test(part) ? 'gap' : 'text';
          for (let at = 0; at < part.length;) {
            const codePoint = part.codePointAt(at) ?? 0;
            let character = String.fromCodePoint(codePoint);
            const unit = offset + at;
            at += character.length;
            if (codePoint >= 0xad && IGNORABLE.test(character)) {
              // L144: a soft hyphen is a hyphenation point, drawn only if taken.
              if (codePoint === 0xad && group !== '' && part.charCodeAt(at) !== 0x2060) shy.push(group.length);
              continue;
            }
            let font = baseStyle.font;
            let bitmap: PdfFontBitmap | null = null;
            if (codePoint < 0x20 || !supportsRune(font, codePoint)) {
              for (const fallback of codePoint < 0x20 ? [] : textStyle.fontFallback) {
                const candidate = fallback.getFont(context);
                if (supportsRune(candidate, codePoint)) {
                  font = candidate;
                  bitmap = candidate.getBitmap?.(codePoint) ?? null;
                  break;
                }
              }
              // L142: a separator no font can draw advances like a U+0020.
              if (font === baseStyle.font && (codePoint < 0x20 || /\s/.test(character))) character = ' ';
            }
            if (bitmap !== null) {
              flush();
              const metrics = bitmap.metrics.scale(baseStyle.fontSize);
              const widget = bitmapWidget(bitmap, baseStyle.fontSize);
              const childBox = widget.layout(context, new BoxConstraints({
                maxWidth,
                maxHeight: Infinity
              }));
              result.push({
                kind: 'widget',
                width: childBox.width,
                height: childBox.height,
                style: {
                  ...baseStyle,
                  font,
                  baseline: baseStyle.baseline + metrics.ascent + metrics.descent - metrics.height
                },
                childBox,
                annotation,
                levels: levels?.subarray(unit, unit + 1) ?? null
              });
              groupFont = baseStyle.font;
              continue;
            }
            if (font !== groupFont && group !== '') flush();
            groupFont = font;
            if (levels !== null) groupLevels?.set(levels.subarray(unit, unit + character.length), group.length);
            group += character;
            if (at > 1 && cutsAfter(codePoint, part.charAt(at))) hyphens.push(group.length);
          }
          flush();
          offset += part.length;
        }
      }
    }
    const first = items[0];
    return {
      tokens: result,
      style: first === undefined ? null : first.kind === 'widget' ? first.token.style : first.style,
      bidi: levels !== null
    };
  }

  private allLines(context: RenderContext, contentWidth: number, minContentWidth = 0): RichTextLineLayout[] {
    // Upstream's default is TextAlign.start. The port defaulted to left and
    // mirrored RTL lines, which turned an explicit left into right.
    const align = this.textAlign ?? context.theme.textAlign ?? 'start';
    const softWrap = this.softWrap ?? context.theme.softWrap;
    const maxLines = this.maxLines ?? context.theme.maxLines;
    const { tokens, style, bidi } = this.inputTokens(context, contentWidth);
    // L157: a span tree with no text at all lays out empty, as upstream does.
    if (style === null) return [];
    if (context.minContent === true) {
      // A table's min-content pass: break at every opportunity, so the widest
      // line is the widest piece that cannot be split.
      let widest = 1;
      for (const token of tokens) {
        if (token.kind === 'widget') widest = Math.max(widest, token.width);
        else if (token.kind === 'text') widest = Math.max(widest, narrowestPiece(token));
      }
      contentWidth = Math.min(contentWidth, widest);
    }
    const raw: MutableLine[] = [];
    let current: MutableLine = { tokens: [], width: 0, blank: 0, wrapped: false, emptyStyle: style };

    const pushLine = (wrapped: boolean): void => {
      trimTrailingGaps(current);
      const last = current.tokens[current.tokens.length - 1];
      // L157: a line of nothing but whitespace keeps that whitespace's width.
      if (last === undefined) current.width = current.blank;
      // L155: the spacing after the last glyph is not ink, as upstream after #1980.
      else if (last.kind === 'text') current.width -= last.style.letterSpacing;
      current.wrapped = wrapped;
      raw.push(current);
      current = { tokens: [], width: 0, blank: 0, wrapped: false, emptyStyle: current.emptyStyle };
    };

    const appendToken = (token: FlowToken): void => {
      current.tokens.push(token);
      current.width += token.width;
    };

    // Whether `width` more would cross the edge. A text token's own trailing
    // letter spacing may hang past it, as it does at the end of a line.
    const overflows = (width: number, token: FlowToken): boolean =>
      current.width + width - (token.kind === 'text' ? token.style.letterSpacing : 0) > contentWidth + 0.00001;

    for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
      const token = tokens[tokenIndex];
      if (token === undefined) continue;
      current.emptyStyle = token.style;
      if (token.kind === 'break') {
        pushLine(false);
        continue;
      }
      if (token.kind === 'gap' && current.tokens.length === 0) {
        current.blank += token.width;
        continue;
      }

      if (softWrap && token.kind === 'text' && overflows(token.width, token)) {
        // Soft hyphens are the author's own hyphenation points (L144).
        const syllables = token.shy !== undefined
          ? softSyllables(token.text, token.shy)
          : this.hyphenation?.(token.text) ?? [];
        if (syllables.length > 1) {
          if (syllables.some(part => typeof part !== 'string' || part === '')
              || syllables.join('') !== token.text) {
            throw new RangeError('hyphenation must return nonempty syllables which reconstruct the word');
          }
          let fits = '';
          // Keep a nonempty remainder: a trailing hyphen is only a line-break marker.
          for (let index = 0; index < syllables.length - 1; index++) {
            const candidate = fits + syllables[index];
            if (overflows(textWidth(token.style, candidate + '-'), token)) break;
            fits = candidate;
          }
          if (fits !== '') {
            appendToken(sliceToken(token, 0, fits.length, '-'));
            pushLine(true);
            tokens[tokenIndex] = sliceToken(token, fits.length, token.text.length);
            tokenIndex--;
            continue;
          }
        }
      }

      if (softWrap && current.tokens.length > 0 && overflows(token.width, token)) {
        pushLine(true);
        if (token.kind !== 'gap') tokenIndex--;
        continue;
      }

      if (token.kind === 'text' && softWrap && token.width - token.style.letterSpacing > contentWidth + 0.00001) {
        const pieces = splitLongWord(token.text, contentWidth, token.style, token.hyphens ?? []);
        let start = 0;
        for (let index = 0; index < pieces.length; index++) {
          const part = sliceToken(token, start, start += (pieces[index] ?? '').length);
          if (current.tokens.length > 0) pushLine(true);
          current.tokens.push(part);
          current.width = part.width;
          if (index < pieces.length - 1) pushLine(true);
        }
        continue;
      }

      appendToken(token);
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
    const textDirection = this.textDirection ?? Directionality.of(context);
    for (const line of limited) {
      const positioned = positionLine(line, y, targetWidth, align, textDirection, bidi);
      lines.push(positioned);
      y += positioned.height;
    }
    const last = lines[lines.length - 1];
    if (last !== undefined && last.lineSpacing > 0) {
      lines[lines.length - 1] = {
        ...last,
        height: Math.max(0, last.height - last.lineSpacing)
      };
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
          clip: effectiveOverflow === 'clip' || naturalHeight > size.height + 0.00001,
          textDirection: this.textDirection ?? Directionality.of(context)
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
        if (run.annotation !== null && run.width > 0 && run.height > 0) {
          run.annotation.build(context, { x, y, width: run.width, height: run.height });
        }
        if (run.style.background !== null && run.width > 0) {
          run.style.background.paint(context, x, y, run.width, run.height, 'all', box.data.textDirection);
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
    lineSplitter = null,
    hyphenation = null,
    style = undefined,
    fontSize = undefined,
    lineHeight = undefined,
    color = undefined,
    align = undefined,
    textAlign = undefined,
    textDirection = null,
    softWrap = undefined,
    tightBounds = false,
    textScaleFactor = 1,
    margin = 0,
    maxLines = undefined,
    overflow = undefined,
    font = undefined
  }: TextOptions = {}) {
    const overrides = new TextStyle({
      color: color === undefined ? null : normalizePaintColor(color),
      font: font === undefined ? null : undefined,
      fontSize: fontSize === undefined ? null : assertFiniteNumber(Number(fontSize), 'fontSize'),
      height: lineHeight === undefined ? null : assertFiniteNumber(Number(lineHeight), 'lineHeight')
    });
    const merged = (style ?? new TextStyle()).merge(overrides);
    super({
      lineSplitter,
      hyphenation,
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

  protected override readonly directFont: PdfFont | null;
}
