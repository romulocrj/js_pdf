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
 * PORT GAP: upstream splits text into `TextSpan`/`RichText` with a full line
 * breaker (bidi, justification, decorations, per-span styles). This file
 * implements a single-style greedy wrapper only.
 *
 * As of phase 1.4 the style comes from the theme: `context.theme`'s default text
 * style is merged with the widget's own `style`, and the loose options below
 * override whatever that produced. That is why they no longer carry defaults —
 * an option left out has to be distinguishable from one set to the theme's
 * value.
 */

import { assertFiniteNumber } from '../base/assert.ts';
import { normalizeColor } from '../pdf/color.ts';
import type { ColorInput, Rgb } from '../pdf/color.ts';
import type { PdfFont } from '../pdf/font/font.ts';
import { defaultPdfFont } from '../pdf/font/type1_fonts.ts';
import { normalizeInsets } from './geometry.ts';
import type { Insets, InsetsInput } from './geometry.ts';
import type { TextStyle } from './text_style.ts';
import { DEFAULT_FONT_SIZE, DEFAULT_LINE_HEIGHT } from './text_style.ts';
import { Widget } from './widget.ts';
import type { Constraints, LayoutBox, PositionedBox, RenderContext } from './widget.ts';

export { DEFAULT_FONT_SIZE, DEFAULT_LINE_HEIGHT };

/**
 * PORT GAP: `justify` is accepted but painted as `left`. Justifying means
 * distributing the slack across a line's word gaps, which is part of the real
 * line breaker in roadmap phase 3.7.
 */
export type TextAlign = 'left' | 'center' | 'right' | 'justify';

/** Upstream's `TextOverflow`. Carried by the theme; not yet acted on. */
export type TextOverflow = 'clip' | 'visible' | 'span';

export interface TextOptions {
  /** Merged onto the theme's default text style. */
  readonly style?: TextStyle;

  readonly fontSize?: number;
  readonly lineHeight?: number;
  readonly color?: ColorInput;
  readonly align?: TextAlign;
  readonly margin?: InsetsInput;

  /** Drop every line past this one. Upstream's `maxLines`. */
  readonly maxLines?: number;

  /**
   * Draw with this font object, bypassing the theme entirely. Predates
   * `TextStyle` — a `Font` declaration belongs in `style.font`; this is the
   * escape hatch for a caller holding a `PdfFont`.
   */
  readonly font?: PdfFont;
}

/** A `TextStyle` with every field the painter needs already decided. */
interface ResolvedTextStyle {
  readonly font: PdfFont;
  readonly fontSize: number;
  readonly color: Rgb;
  readonly align: TextAlign;
  readonly lineAdvance: number;
  readonly letterSpacing: number;
  readonly wordSpacing: number;
  readonly maxLines: number | null;
}

export interface TextLayoutData {
  readonly lines: readonly string[];
  readonly lineAdvance: number;
  readonly contentWidth: number;
  readonly style: ResolvedTextStyle;
}

function textWidth(font: PdfFont, text: string, fontSize: number, letterSpacing = 0): number {
  return font.stringMetrics(text, fontSize, letterSpacing).advanceWidth;
}

/** Hard-split a word that cannot fit on a line by itself. */
function breakLongWord(word: string, maxWidth: number, fontSize: number, font: PdfFont): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const character of word) {
    const candidate = current + character;
    if (current && textWidth(font, candidate, fontSize) > maxWidth) {
      chunks.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

/** Greedy line breaker. Explicit newlines always start a new line. */
export function wrapText(
  value: string,
  maxWidth: number,
  fontSize: number,
  font: PdfFont = defaultPdfFont
): string[] {
  const lines: string[] = [];
  const paragraphs = String(value).replace(/\r\n?/g, '\n').split('\n');

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lines.push('');
      continue;
    }

    const rawWords = paragraph.split(/\s+/);
    let current = '';

    for (const rawWord of rawWords) {
      const words = textWidth(font, rawWord, fontSize) <= maxWidth
        ? [rawWord]
        : breakLongWord(rawWord, maxWidth, fontSize, font);

      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (current && textWidth(font, candidate, fontSize) > maxWidth) {
          lines.push(current);
          current = word;
        } else {
          current = candidate;
        }
      }
    }

    if (current) lines.push(current);
  }

  return lines.length ? lines : [''];
}

export class Text extends Widget<TextLayoutData> {
  readonly value: string;
  readonly style: TextStyle | null;
  readonly fontSize: number | null;
  readonly lineHeight: number | null;
  readonly color: Rgb | null;
  readonly align: TextAlign | null;
  readonly margin: Insets;
  readonly maxLines: number | null;
  readonly font: PdfFont | null;

  constructor(value: string, {
    style = undefined,
    fontSize = undefined,
    lineHeight = undefined,
    color = undefined,
    align = undefined,
    margin = 0,
    maxLines = undefined,
    font = undefined
  }: TextOptions = {}) {
    super();
    this.value = String(value);
    this.style = style ?? null;
    this.fontSize = fontSize === undefined ? null : assertFiniteNumber(Number(fontSize), 'fontSize');
    this.lineHeight = lineHeight === undefined ? null : assertFiniteNumber(Number(lineHeight), 'lineHeight');
    this.color = color === undefined ? null : normalizeColor(color);
    this.align = align ?? null;
    this.margin = normalizeInsets(margin);
    this.maxLines = maxLines ?? null;
    this.font = font ?? null;
  }

  /**
   * Resolved per call rather than in the constructor: neither the theme nor the
   * document's fonts exist until render time, and `layout()` must stay free of
   * cached state — `MultiPage` re-lays the same instance on the next page.
   */
  private resolveStyle(context: RenderContext): ResolvedTextStyle {
    const theme = context.theme;
    const merged = theme.defaultTextStyle.merge(this.style);
    const fontSize = this.fontSize ?? merged.fontSize ?? DEFAULT_FONT_SIZE;
    const declaredFont = merged.font;

    return {
      font: this.font ?? (declaredFont === null ? context.document.font : declaredFont.getFont(context)),
      fontSize,
      color: this.color ?? merged.color ?? [0, 0, 0],
      align: this.align ?? theme.textAlign ?? 'left',
      lineAdvance: fontSize * (this.lineHeight ?? merged.height ?? DEFAULT_LINE_HEIGHT)
        + (merged.lineSpacing ?? 0),
      letterSpacing: merged.letterSpacing ?? 0,
      wordSpacing: merged.wordSpacing ?? 0,
      maxLines: this.maxLines ?? theme.maxLines
    };
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<TextLayoutData> {
    const style = this.resolveStyle(context);
    const contentWidth = Math.max(1, constraints.maxWidth - this.margin.left - this.margin.right);
    const wrapped = wrapText(this.value, contentWidth, style.fontSize, style.font);
    const lines = style.maxLines === null ? wrapped : wrapped.slice(0, Math.max(1, style.maxLines));
    const contentHeight = lines.length * style.lineAdvance;

    const widest = Math.max(
      ...lines.map(line => textWidth(style.font, line, style.fontSize, style.letterSpacing)),
      0
    );

    return {
      widget: this,
      width: Math.min(constraints.maxWidth, widest + this.margin.left + this.margin.right),
      height: contentHeight + this.margin.top + this.margin.bottom,
      data: { lines, lineAdvance: style.lineAdvance, contentWidth, style }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<TextLayoutData>): void {
    const { canvas } = context;
    const { lines, lineAdvance, contentWidth, style } = box.data;
    const xStart = box.x + this.margin.left;
    let baseline = box.y + this.margin.top + style.fontSize;

    for (const line of lines) {
      const lineWidth = textWidth(style.font, line, style.fontSize, style.letterSpacing);
      let x = xStart;
      if (style.align === 'center') x += (contentWidth - lineWidth) / 2;
      if (style.align === 'right') x += contentWidth - lineWidth;

      canvas.text(line, x, baseline, {
        fontSize: style.fontSize,
        color: style.color,
        font: style.font,
        letterSpacing: style.letterSpacing,
        wordSpacing: style.wordSpacing
      });
      baseline += lineAdvance;
    }
  }
}
