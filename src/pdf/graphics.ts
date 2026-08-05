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
 *   - pdf/lib/src/pdf/graphics.dart
 *   - pdf/lib/src/pdf/graphic_state.dart
 */

import { colorOperator } from './color.ts';
import type { ColorInput } from './color.ts';
import { formatNumber } from './format/num.ts';
import { pdfLiteral } from './format/string.ts';

export interface TextStyle {
  readonly fontSize: number;
  readonly color: ColorInput;
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

  constructor(pageHeight: number) {
    this.pageHeight = pageHeight;
  }

  push(command: string): void {
    this.commands.push(command);
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

  text(text: string, x: number, baselineFromTop: number, style: TextStyle): void {
    const baseline = this.pageHeight - baselineFromTop;
    const fontSize = style.fontSize;
    const command = [
      'BT',
      '/F1', formatNumber(fontSize), 'Tf',
      colorOperator(style.color),
      '1 0 0 1', formatNumber(x), formatNumber(baseline), 'Tm',
      pdfLiteral(text), 'Tj',
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
