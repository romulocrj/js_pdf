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
 *   - pdf/lib/src/pdf/graphics.dart
 *   - pdf/lib/src/pdf/graphic_state.dart
 */

import { colorOperator } from './color.ts';
import type { ColorInput } from './color.ts';
import type { PdfFont } from './font/font.ts';
import { defaultPdfFont } from './font/type1_fonts.ts';
import { formatNumber } from './format/num.ts';

/**
 * What `PdfCanvas.text` needs to write one run of text. Named for the canvas
 * rather than called `TextStyle`, which as of phase 1.4 is the widget-level
 * value type in `widgets/text_style.ts`; this is its resolved, drawable form.
 */
export interface CanvasTextStyle {
  readonly fontSize: number;
  readonly color: ColorInput;
  readonly font?: PdfFont;

  /** `Tc`, extra space per glyph. Omitted from the output when zero. */
  readonly letterSpacing?: number;

  /**
   * `Tw`, extra space per space character. Omitted when zero.
   *
   * PORT GAP: `Tw` applies to single-byte code 32 only, so a reader ignores it
   * for the two-byte CIDs an embedded TrueType font emits. Word spacing has no
   * effect on TTF text until the port measures and inserts the space itself.
   */
  readonly wordSpacing?: number;
}

export interface CircleOptions {
  readonly fill?: ColorInput | null;
  readonly stroke?: ColorInput | null;
  readonly lineWidth?: number;
}

/**
 * Content-stream builder for one page.
 *
 * Coordinates given to these methods are top-left origin (the widget layer's
 * convention); the canvas flips them into PDF's bottom-left user space. Like
 * upstream `PdfGraphics`, the operators are appended to a buffer and never
 * re-read.
 */
export class PdfCanvas {
  readonly pageHeight: number;
  private readonly commands: string[] = [];
  private readonly fontNames = new Map<PdfFont, string>();

  constructor(pageHeight: number) {
    this.pageHeight = pageHeight;
  }

  push(command: string): void {
    this.commands.push(command);
  }

  /**
   * Register `font` on this page and return the name a `Tf` operator should
   * use. Names are allocated in first-use order — `/F1`, `/F2`, … — and repeat
   * for the same font, so a page's `/Font` dictionary has one entry per font.
   *
   * Upstream derives the name from the font object's serial number instead
   * (`/F$objser`), which it can do because its `PdfFont` is an indirect object
   * from the moment it is created. Here a page is rendered to operators before
   * any document exists, so the name has to be page-local; `PdfDocument.addPage`
   * is what binds it to the font object. Consequence: two pages using the same
   * font both call it `/F1` and share one font object.
   */
  addFont(font: PdfFont): string {
    const existing = this.fontNames.get(font);
    if (existing !== undefined) {
      return existing;
    }

    const name = `/F${this.fontNames.size + 1}`;
    this.fontNames.set(font, name);
    return name;
  }

  /** The fonts this page drew with, mapped to the names it wrote for them. */
  get fonts(): ReadonlyMap<PdfFont, string> {
    return this.fontNames;
  }

  save(): void {
    this.push('q');
  }

  restore(): void {
    this.push('Q');
  }

  fillRect(x: number, top: number, width: number, height: number, color: ColorInput): void {
    const bottom = this.pageHeight - top - height;
    this.push(`${colorOperator(color)} ${formatNumber(x)} ${formatNumber(bottom)} ${formatNumber(width)} ${formatNumber(height)} re f`);
  }

  strokeRect(x: number, top: number, width: number, height: number, color: ColorInput, lineWidth = 1): void {
    const bottom = this.pageHeight - top - height;
    this.push(`${colorOperator(color, true)} ${formatNumber(lineWidth)} w ${formatNumber(x)} ${formatNumber(bottom)} ${formatNumber(width)} ${formatNumber(height)} re S`);
  }

  text(text: string, x: number, baselineFromTop: number, style: CanvasTextStyle): void {
    const baseline = this.pageHeight - baselineFromTop;
    const fontSize = style.fontSize;
    const font = style.font ?? defaultPdfFont;
    const letterSpacing = style.letterSpacing ?? 0;
    const wordSpacing = style.wordSpacing ?? 0;

    const command = [
      'BT',
      this.addFont(font), formatNumber(fontSize), 'Tf',
      colorOperator(style.color),
      // Only written when asked for: the spacing operators are sticky within a
      // text object, and emitting `0 Tc` on every run would move every byte of
      // every document that never sets them.
      ...(letterSpacing !== 0 ? [formatNumber(letterSpacing), 'Tc'] : []),
      ...(wordSpacing !== 0 ? [formatNumber(wordSpacing), 'Tw'] : []),
      '1 0 0 1', formatNumber(x), formatNumber(baseline), 'Tm',
      font.encodeText(text), 'Tj',
      'ET'
    ].join(' ');
    this.push(command);
  }

  line(x1: number, top1: number, x2: number, top2: number, color: ColorInput = '#000000', lineWidth = 1): void {
    const y1 = this.pageHeight - top1;
    const y2 = this.pageHeight - top2;
    this.push(`${colorOperator(color, true)} ${formatNumber(lineWidth)} w ${formatNumber(x1)} ${formatNumber(y1)} m ${formatNumber(x2)} ${formatNumber(y2)} l S`);
  }

  circle(cx: number, topCenter: number, radius: number, { fill = null, stroke = null, lineWidth = 1 }: CircleOptions = {}): void {
    const cy = this.pageHeight - topCenter;
    const k = 0.5522847498;
    const ox = radius * k;
    const oy = radius * k;
    const path = [
      `${formatNumber(cx + radius)} ${formatNumber(cy)} m`,
      `${formatNumber(cx + radius)} ${formatNumber(cy + oy)} ${formatNumber(cx + ox)} ${formatNumber(cy + radius)} ${formatNumber(cx)} ${formatNumber(cy + radius)} c`,
      `${formatNumber(cx - ox)} ${formatNumber(cy + radius)} ${formatNumber(cx - radius)} ${formatNumber(cy + oy)} ${formatNumber(cx - radius)} ${formatNumber(cy)} c`,
      `${formatNumber(cx - radius)} ${formatNumber(cy - oy)} ${formatNumber(cx - ox)} ${formatNumber(cy - radius)} ${formatNumber(cx)} ${formatNumber(cy - radius)} c`,
      `${formatNumber(cx + ox)} ${formatNumber(cy - radius)} ${formatNumber(cx + radius)} ${formatNumber(cy - oy)} ${formatNumber(cx + radius)} ${formatNumber(cy)} c`
    ].join(' ');

    if (fill && stroke) {
      this.push(`${colorOperator(fill)} ${colorOperator(stroke, true)} ${formatNumber(lineWidth)} w ${path} B`);
    } else if (fill) {
      this.push(`${colorOperator(fill)} ${path} f`);
    } else {
      this.push(`${colorOperator(stroke ?? '#000000', true)} ${formatNumber(lineWidth)} w ${path} S`);
    }
  }

  output(): string {
    return `${this.commands.join('\n')}\n`;
  }
}
