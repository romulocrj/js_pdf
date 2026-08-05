/*
 * Ported to JavaScript from DavBfr/dart_pdf.
 *
 * Original work:
 * Copyright (C) 2017, David PHAM-VAN
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
 */

import { assertFiniteNumber } from '../base/assert.ts';
import { normalizeColor } from '../pdf/color.ts';
import type { ColorInput, Rgb } from '../pdf/color.ts';
import type { PdfFont } from '../pdf/font/font.ts';
import { defaultPdfFont } from '../pdf/font/type1_fonts.ts';
import { normalizeInsets } from './geometry.ts';
import type { Insets, InsetsInput } from './geometry.ts';
import { Widget } from './widget.ts';
import type { Constraints, LayoutBox, PositionedBox, RenderContext } from './widget.ts';

export const DEFAULT_FONT_SIZE = 12;
export const DEFAULT_LINE_HEIGHT = 1.2;

export type TextAlign = 'left' | 'center' | 'right';

export interface TextOptions {
  readonly fontSize?: number;
  readonly lineHeight?: number;
  readonly color?: ColorInput;
  readonly align?: TextAlign;
  readonly margin?: InsetsInput;
}

export interface TextLayoutData {
  readonly lines: readonly string[];
  readonly lineAdvance: number;
  readonly contentWidth: number;
}

/** Hard-split a word that cannot fit on a line by itself. */
function textWidth(font: PdfFont, text: string, fontSize: number): number {
  return font.stringMetrics(text, fontSize).advanceWidth;
}

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
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly color: Rgb;
  readonly align: TextAlign;
  readonly margin: Insets;

  constructor(value: string, {
    fontSize = DEFAULT_FONT_SIZE,
    lineHeight = DEFAULT_LINE_HEIGHT,
    color = '#000000',
    align = 'left',
    margin = 0
  }: TextOptions = {}) {
    super();
    this.value = String(value);
    this.fontSize = assertFiniteNumber(Number(fontSize), 'fontSize');
    this.lineHeight = assertFiniteNumber(Number(lineHeight), 'lineHeight');
    this.color = normalizeColor(color);
    this.align = align;
    this.margin = normalizeInsets(margin);
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<TextLayoutData> {
    const font = context.document.font;
    const contentWidth = Math.max(1, constraints.maxWidth - this.margin.left - this.margin.right);
    const lines = wrapText(this.value, contentWidth, this.fontSize, font);
    const lineAdvance = this.fontSize * this.lineHeight;
    const contentHeight = lines.length * lineAdvance;

    return {
      widget: this,
      width: Math.min(constraints.maxWidth, Math.max(...lines.map(line => textWidth(font, line, this.fontSize)), 0) + this.margin.left + this.margin.right),
      height: contentHeight + this.margin.top + this.margin.bottom,
      data: { lines, lineAdvance, contentWidth }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<TextLayoutData>): void {
    const { canvas } = context;
    const font = context.document.font;
    const { lines, lineAdvance, contentWidth } = box.data;
    const xStart = box.x + this.margin.left;
    let baseline = box.y + this.margin.top + this.fontSize;

    for (const line of lines) {
      const lineWidth = textWidth(font, line, this.fontSize);
      let x = xStart;
      if (this.align === 'center') x += (contentWidth - lineWidth) / 2;
      if (this.align === 'right') x += contentWidth - lineWidth;

      canvas.text(line, x, baseline, {
        fontSize: this.fontSize,
        color: this.color,
        font
      });
      baseline += lineAdvance;
    }
  }
}
