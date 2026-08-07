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
 *   - pdf/lib/src/widgets/svg.dart
 *
 * The public bridge from widget layout into the internal SVG painter. Its
 * layout data carries every fitted size and crop offset; the widget itself
 * stores no measurement and is safe to lay out again after a page break.
 *
 * SVG text resolves the standard generic families and accepts the same custom
 * font lookup hook as upstream.
 */

import { normalizeColor } from '../pdf/color.ts';
import type { ColorInput, Rgb } from '../pdf/color.ts';
import type { PdfMatrix } from '../pdf/matrix.ts';
import { SvgPainter } from '../svg/painter.ts';
import { SvgParser } from '../svg/parser.ts';
import { parseXml } from '../svg/xml.ts';
import { Alignment, BoxConstraints, inscribe } from './geometry.ts';
import type { Alignment as AlignmentValue } from './geometry.ts';
import { Font } from './font.ts';
import { Widget } from './widget.ts';
import type { Constraints, LayoutBox, PositionedBox, RenderContext } from './widget.ts';

export type BoxFit = 'fill' | 'contain' | 'cover' | 'fitWidth' | 'fitHeight' | 'none' | 'scaleDown';
export type AlignmentName = keyof typeof Alignment;
export type AlignmentInput = AlignmentValue | AlignmentName;
export type SvgCustomFontLookup = (
  fontFamily: string,
  fontStyle: string,
  fontWeight: string
) => Font | null;

export interface SvgFittedSize {
  readonly width: number;
  readonly height: number;
}

export interface SvgImageLayoutData {
  readonly source: SvgFittedSize;
  readonly destination: SvgFittedSize;
  readonly sourceX: number;
  readonly sourceY: number;
}

export interface SvgImageOptions {
  readonly svg: string;
  readonly fit?: BoxFit;
  readonly alignment?: AlignmentInput;
  readonly clip?: boolean;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly colorFilter?: ColorInput | null;
  readonly customFontLookup?: SvgCustomFontLookup | null;
}

interface FittedSizes {
  readonly source: SvgFittedSize;
  readonly destination: SvgFittedSize;
}

function size(width: number, height: number): SvgFittedSize {
  return { width: Math.max(0, width), height: Math.max(0, height) };
}

function applyBoxFit(fit: BoxFit, input: SvgFittedSize, output: SvgFittedSize): FittedSizes {
  const iw = input.width;
  const ih = input.height;
  const ow = output.width;
  const oh = output.height;

  if (iw <= 0 || ih <= 0 || ow <= 0 || oh <= 0) {
    return { source: size(0, 0), destination: size(0, 0) };
  }

  switch (fit) {
    case 'fill':
      return { source: size(iw, ih), destination: size(ow, oh) };

    case 'contain': {
      const scale = Math.min(ow / iw, oh / ih);
      return { source: size(iw, ih), destination: size(iw * scale, ih * scale) };
    }

    case 'cover': {
      const scale = Math.max(ow / iw, oh / ih);
      return { source: size(ow / scale, oh / scale), destination: size(ow, oh) };
    }

    case 'fitWidth': {
      const scale = ow / iw;
      const height = ih * scale;
      return height > oh
        ? { source: size(iw, oh / scale), destination: size(ow, oh) }
        : { source: size(iw, ih), destination: size(ow, height) };
    }

    case 'fitHeight': {
      const scale = oh / ih;
      const width = iw * scale;
      return width > ow
        ? { source: size(ow / scale, ih), destination: size(ow, oh) }
        : { source: size(iw, ih), destination: size(width, oh) };
    }

    case 'none': {
      const source = size(Math.min(iw, ow), Math.min(ih, oh));
      return { source, destination: source };
    }

    case 'scaleDown': {
      const scale = Math.min(1, ow / iw, oh / ih);
      return { source: size(iw, ih), destination: size(iw * scale, ih * scale) };
    }

    default:
      throw new TypeError(`Unknown BoxFit: ${fit}`);
  }
}

function resolveAlignment(value: AlignmentInput): AlignmentValue {
  if (typeof value !== 'string') {
    return value;
  }

  const resolved: AlignmentValue | undefined = Alignment[value];
  if (resolved === undefined) {
    throw new TypeError(`Unknown alignment: ${value}`);
  }
  return resolved;
}

function constrain(value: number, maximum: number): number {
  return Math.max(0, Math.min(value, maximum));
}

export class SvgImage extends Widget<SvgImageLayoutData> {
  readonly fit: BoxFit;
  readonly alignment: AlignmentValue;
  readonly clip: boolean;
  readonly width: number | null;
  readonly height: number | null;

  private readonly parser: SvgParser;
  private readonly customFontLookup: SvgCustomFontLookup | null;

  constructor({
    svg,
    fit = 'contain',
    alignment = Alignment.center,
    clip = true,
    width = null,
    height = null,
    colorFilter = null,
    customFontLookup = null
  }: SvgImageOptions) {
    super();
    this.parser = SvgParser.fromXml({
      xml: parseXml(svg),
      colorFilter: colorFilter === null ? null : normalizeColor(colorFilter) as Rgb
    });
    this.fit = fit;
    this.alignment = resolveAlignment(alignment);
    this.clip = Boolean(clip);
    this.width = width === null ? null : Number(width);
    this.height = height === null ? null : Number(height);
    this.customFontLookup = customFontLookup;
  }

  override layout(_context: RenderContext, constraints: Constraints): LayoutBox<SvgImageLayoutData> {
    const parent = BoxConstraints.from(constraints);
    const offeredWidth = this.width !== null || this.parser.width !== null
      ? constrain(this.width ?? this.parser.width!, parent.maxWidth)
      : (parent.hasBoundedWidth
        ? parent.maxWidth
        : constrain(this.parser.viewBox.width, parent.maxWidth));
    const offeredHeight = this.height !== null || this.parser.height !== null
      ? constrain(this.height ?? this.parser.height!, parent.maxHeight)
      : (parent.hasBoundedHeight
        ? parent.maxHeight
        : constrain(this.parser.viewBox.height, parent.maxHeight));

    const fitted = applyBoxFit(
      this.fit,
      size(this.parser.viewBox.width, this.parser.viewBox.height),
      size(offeredWidth, offeredHeight)
    );
    const sourceOffset = inscribe(
      this.alignment,
      fitted.source.width,
      fitted.source.height,
      this.parser.viewBox.width,
      this.parser.viewBox.height
    );

    return {
      widget: this,
      // Upstream's image widgets return the BoxFit destination directly. In
      // particular, a contained image may remain shorter than a tight parent;
      // wrappers such as FullPage then position that intrinsic destination.
      width: fitted.destination.width,
      height: fitted.destination.height,
      data: {
        source: fitted.source,
        destination: fitted.destination,
        sourceX: this.parser.viewBox.x + sourceOffset.dx,
        sourceY: this.parser.viewBox.y + sourceOffset.dy
      }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<SvgImageLayoutData>): void {
    const { source, destination, sourceX, sourceY } = box.data;
    if (source.width <= 0 || source.height <= 0) {
      return;
    }

    const sx = destination.width / source.width;
    const sy = destination.height / source.height;
    const matrix: PdfMatrix = [
      sx,
      0,
      0,
      -sy,
      box.x - sourceX * sx,
      context.canvas.pageHeight - box.y + sourceY * sy
    ];

    context.canvas.saveContext();
    if (this.clip) {
      context.canvas.drawRect(
        box.x,
        context.canvas.pageHeight - box.y - box.height,
        box.width,
        box.height
      );
      context.canvas.clipPath();
    }
    context.canvas.setTransform(matrix);

    new SvgPainter(
      this.parser,
      context.canvas,
      { x: 0, y: 0, width: context.pageFormat.width, height: context.pageFormat.height },
      (family, style, weight) => {
        const custom = this.customFontLookup?.(family, style, weight);
        if (custom !== null && custom !== undefined) return custom.getFont(context);
        const bold = weight !== 'normal' && weight !== 'lighter';
        const italic = style !== 'normal';
        const font = family === 'serif'
          ? (italic ? (bold ? Font.timesBoldItalic() : Font.timesItalic()) : (bold ? Font.timesBold() : Font.times()))
          : family === 'monospace'
            ? (italic ? (bold ? Font.courierBoldOblique() : Font.courierOblique()) : (bold ? Font.courierBold() : Font.courier()))
            : (italic ? (bold ? Font.helveticaBoldOblique() : Font.helveticaOblique()) : (bold ? Font.helveticaBold() : Font.helvetica()));
        return font.getFont(context);
      }
    ).paint();
    context.canvas.restoreContext();
  }
}
