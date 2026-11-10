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
 *   - pdf/lib/src/svg/text.dart
 *
 * A `<text>` is a list of runs, one per text node, laid out by walking the
 * element in document order with one pen (after upstream PR #1980). Upstream
 * joined the element's own text, trimmed it and drew each `<tspan>` after it,
 * so `AB<tspan>CD</tspan>EF` drew `ABEF` then `CD`, and anchored each tspan
 * on its ink width. Now:
 *
 *   - an `x` or `y` starts a new chunk, `dx` and `dy` move the pen;
 *   - `text-anchor` shifts a whole chunk by its advance width;
 *   - white space collapses (any run becomes one space, none at a chunk's
 *     start, a trailing one only once more text follows) unless the inherited
 *     `xml:space="preserve"` keeps it, newlines and tabs as spaces;
 *   - only `<tspan>`, `<textPath>` and `<a>` contribute text, not `<title>`.
 *
 * PORT GAP: `<textPath>` text is flowed on the line, not along its path.
 */

import { PdfGraphicState } from '../pdf/graphic_state.ts';
import type { PdfFont } from '../pdf/font/font.ts';
import type { PdfFontMetrics } from '../pdf/font/font_metrics.ts';
import type { PdfCanvas } from '../pdf/graphics.ts';
import type { PdfRect } from '../pdf/rect.ts';
import { SvgBrush } from './brush.ts';
import type { SvgTextAnchor } from './brush.ts';
import { SvgClipPath } from './clip_path.ts';
import { SvgOperation } from './operation.ts';
import type { SvgPainter } from './painter.ts';
import { getNumeric } from './parser.ts';
import { SvgTransform } from './transform.ts';
import { XmlText } from './xml.ts';
import type { XmlElement } from './xml.ts';

/** One text node drawn at one place, with the style in force where it was written. */
export interface SvgTextRun {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly font: PdfFont;
  readonly fontSize: number;
  readonly metrics: PdfFontMetrics;
  readonly brush: SvgBrush;
  /** Opacity of nested text elements; the outer text's is applied by its operation. */
  readonly opacity?: number;
}

interface TextChunk {
  readonly anchor: SvgTextAnchor;
  readonly runs: SvgTextRun[];
}

interface TextLayout {
  x: number;
  y: number;
  /** Collapsed white space held back until more text follows. */
  space: boolean;
  readonly chunks: TextChunk[];
}

const TEXT_CONTENT = new Set(['tspan', 'textPath', 'a']);

export class SvgText extends SvgOperation {
  readonly runs: readonly SvgTextRun[];

  constructor(
    runs: readonly SvgTextRun[],
    brush: SvgBrush,
    clip: SvgClipPath,
    transform: SvgTransform,
    painter: SvgPainter
  ) {
    super(brush, clip, transform, painter);
    this.runs = runs;
  }

  static fromXml(element: XmlElement, painter: SvgPainter, parent: SvgBrush): SvgText {
    const brush = SvgBrush.fromXml(element, parent, painter.parser);
    const layout: TextLayout = { x: 0, y: 0, space: false, chunks: [] };
    SvgText.walk(element, painter, brush, layout, true);

    const runs: SvgTextRun[] = [];
    for (const { anchor, runs: chunk } of layout.chunks) {
      const width = chunk.reduce((sum, run) => sum + run.metrics.advanceWidth, 0);
      const shift = anchor === 'middle' ? -width / 2 : anchor === 'end' ? -width : 0;
      for (const run of chunk) runs.push(shift === 0 ? run : { ...run, x: run.x + shift });
    }

    return new SvgText(
      runs,
      brush,
      SvgClipPath.fromXml(element, painter, brush),
      SvgTransform.fromXml(element),
      painter
    );
  }

  private static walk(
    element: XmlElement,
    painter: SvgPainter,
    brush: SvgBrush,
    layout: TextLayout,
    root: boolean,
    opacity = 1
  ): void {
    const length = (name: string, axis: 'x' | 'y'): number | null =>
      getNumeric(element, name, brush)?.lengthIn(axis) ?? null;
    const x = length('x', 'x');
    const y = length('y', 'y');
    if (root || x !== null || y !== null) {
      layout.chunks.push({ anchor: brush.textAnchor ?? 'start', runs: [] });
      layout.space = false;
    }
    layout.x = (x ?? layout.x) + (length('dx', 'x') ?? 0);
    layout.y = (y ?? layout.y) + (length('dy', 'y') ?? 0);

    const font = painter.resolveFont(brush.fontFamily!, brush.fontStyle!, brush.fontWeight!);
    const fontSize = brush.fontSize!.sizeValue;
    const chunk = (): TextChunk => layout.chunks[layout.chunks.length - 1]!;

    for (const node of element.children) {
      if (!(node instanceof XmlText)) {
        if (TEXT_CONTENT.has(node.name.local)) {
          const childBrush = SvgBrush.fromXml(node, brush, painter.parser);
          SvgText.walk(node, painter, childBrush, layout, false, opacity * (childBrush.opacity ?? 1));
        }
        continue;
      }

      let text = node.value.replace(brush.preserveSpace === true ? /[\r\n\t]/g : /\s+/g, ' ');
      if (brush.preserveSpace !== true) {
        const lead = text.startsWith(' ');
        const trail = text.endsWith(' ');
        text = text.trim();
        if (text.length > 0 && (layout.space || lead) && chunk().runs.length > 0) text = ` ${text}`;
        layout.space = text.length > 0 ? trail : layout.space || lead || trail;
      }
      if (text.length === 0) continue;

      const metrics = font.stringMetrics(text, fontSize);
      chunk().runs.push({ text, x: layout.x, y: layout.y, font, fontSize, metrics, brush, opacity });
      layout.x += metrics.advanceWidth;
    }
  }

  protected paintShape(canvas: PdfCanvas): void {
    for (const run of this.runs) {
      const { brush } = run;
      const fill = brush.fill!;
      const stroke = brush.stroke!;
      // Colour alpha folds into the opacities; the canvas gets an opaque colour.
      const fillOpacity = brush.fillOpacity! * fill.opacity * (run.opacity ?? 1);
      const strokeOpacity = brush.strokeOpacity! * stroke.opacity * (run.opacity ?? 1);
      const strokeWidth = brush.strokeWidth?.lengthIn() ?? 1;
      if (fill.isNotEmpty && fillOpacity > 0) {
        canvas.saveContext();
        fill.setFillColor(this, canvas);
        if (fillOpacity < 1) {
          canvas.setGraphicState(new PdfGraphicState({ opacity: fillOpacity }));
        }
        canvas.drawString(run.font, run.fontSize, run.text, run.x, run.y, 0);
        canvas.restoreContext();
      }
      // A zero or negative stroke-width strokes nothing (a PDF `0 w` is a hairline).
      if (stroke.isNotEmpty && strokeOpacity > 0 && strokeWidth > 0) {
        canvas.saveContext();
        stroke.setStrokeColor(this, canvas);
        canvas.setLineWidth(strokeWidth);
        if (brush.strokeDashArray !== null) canvas.setLineDashPattern(brush.strokeDashArray);
        if (strokeOpacity < 1) {
          canvas.setGraphicState(new PdfGraphicState({ opacity: strokeOpacity }));
        }
        canvas.drawString(run.font, run.fontSize, run.text, run.x, run.y, 1);
        canvas.restoreContext();
      }
    }
  }

  protected drawShape(canvas: PdfCanvas): void {
    for (const run of this.runs) {
      canvas.drawString(run.font, run.fontSize, run.text, run.x, run.y, 7);
    }
  }

  boundingBox(): PdfRect {
    let left = Infinity;
    let bottom = Infinity;
    let right = -Infinity;
    let top = -Infinity;
    for (const { x, y, metrics } of this.runs) {
      left = Math.min(left, x + metrics.left);
      right = Math.max(right, x + metrics.right);
      bottom = Math.min(bottom, y - metrics.bottom);
      top = Math.max(top, y - metrics.top);
    }
    return left > right
      ? { x: 0, y: 0, width: 0, height: 0 }
      : { x: left, y: bottom, width: right - left, height: top - bottom };
  }
}
