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
 *   - pdf/lib/src/widgets/grid_paper.dart
 */

import type { ColorInput } from '../pdf/color.ts';
import { PdfGraphicState } from '../pdf/graphic_state.ts';
import { PageUnit } from '../pdf/page_format.ts';
import { Border, BorderSide } from './box_border.ts';
import type { BoxBorder } from './box_border.ts';
import { BoxConstraints, normalizeInsets } from './geometry.ts';
import type { Insets, InsetsInput } from './geometry.ts';
import { Widget } from './widget.ts';
import type {
  AnyLayoutBox,
  AnyWidget,
  Constraints,
  LayoutBox,
  PositionedBox,
  RenderContext
} from './widget.ts';

export interface GridPaperOptions {
  readonly color?: ColorInput;
  readonly horizontalColor?: ColorInput;
  readonly verticalColor?: ColorInput;
  readonly interval?: number;
  readonly horizontalInterval?: number;
  readonly verticalInterval?: number;
  readonly divisions?: number;
  readonly horizontalDivisions?: number;
  readonly verticalDivisions?: number;
  readonly subdivisions?: number;
  readonly horizontalSubdivisions?: number;
  readonly verticalSubdivisions?: number;
  readonly margin?: InsetsInput;
  readonly horizontalOffset?: number;
  readonly verticalOffset?: number;
  readonly border?: BoxBorder;
  readonly scale?: number;
  readonly opacity?: number;
  readonly child?: AnyWidget | null;
}

export interface GridPaperLayoutData {
  readonly childBox: AnyLayoutBox | null;
}

const GRID_COLOR = '#c3e8f3';

/** Draws configurable rectilinear paper over an optional child. */
export class GridPaper extends Widget<GridPaperLayoutData> {
  readonly horizontalColor: ColorInput;
  readonly verticalColor: ColorInput;
  readonly horizontalInterval: number;
  readonly verticalInterval: number;
  readonly horizontalDivisions: number;
  readonly verticalDivisions: number;
  readonly horizontalSubdivisions: number;
  readonly verticalSubdivisions: number;
  readonly margin: Insets;
  readonly horizontalOffset: number;
  readonly verticalOffset: number;
  readonly border: BoxBorder;
  readonly scale: number;
  readonly opacity: number;
  readonly child: AnyWidget | null;

  constructor({
    color = GRID_COLOR,
    horizontalColor = color,
    verticalColor = color,
    interval = 100,
    horizontalInterval = interval,
    verticalInterval = interval,
    divisions = 5,
    horizontalDivisions = divisions,
    verticalDivisions = divisions,
    subdivisions = 2,
    horizontalSubdivisions = subdivisions,
    verticalSubdivisions = subdivisions,
    margin = 0,
    horizontalOffset = 0,
    verticalOffset = 0,
    border = new Border(),
    scale = 1,
    opacity = 0.5,
    child = null
  }: GridPaperOptions = {}) {
    super();
    for (const value of [horizontalDivisions, verticalDivisions, horizontalSubdivisions, verticalSubdivisions]) {
      if (!Number.isInteger(value) || value <= 0) throw new RangeError('GridPaper divisions must be positive integers');
    }
    const resolvedHorizontalOffset = Number(horizontalOffset);
    const resolvedVerticalOffset = Number(verticalOffset);
    if (!Number.isInteger(resolvedHorizontalOffset) || !Number.isInteger(resolvedVerticalOffset)) {
      throw new RangeError('GridPaper offsets must be finite integers');
    }
    const resolvedScale = Number(scale);
    if (!Number.isFinite(resolvedScale) || resolvedScale < 0) {
      throw new RangeError('GridPaper scale must be a finite non-negative number');
    }
    const resolvedOpacity = Number(opacity);
    if (!Number.isFinite(resolvedOpacity) || resolvedOpacity < 0 || resolvedOpacity > 1) {
      throw new RangeError('GridPaper opacity must be between zero and one');
    }
    this.horizontalColor = horizontalColor;
    this.verticalColor = verticalColor;
    this.horizontalInterval = Number(horizontalInterval);
    this.verticalInterval = Number(verticalInterval);
    this.horizontalDivisions = horizontalDivisions;
    this.verticalDivisions = verticalDivisions;
    this.horizontalSubdivisions = horizontalSubdivisions;
    this.verticalSubdivisions = verticalSubdivisions;
    this.margin = normalizeInsets(margin);
    this.horizontalOffset = resolvedHorizontalOffset;
    this.verticalOffset = resolvedVerticalOffset;
    this.border = border;
    this.scale = resolvedScale;
    this.opacity = resolvedOpacity;
    this.child = child;
  }

  static millimeter({ color = GRID_COLOR, child = null }: Pick<GridPaperOptions, 'color' | 'child'> = {}): GridPaper {
    return new GridPaper({ color, interval: 5 * PageUnit.cm, divisions: 5, subdivisions: 10, child });
  }

  static seyes({ margin = { top: 20 * PageUnit.mm, bottom: 10 * PageUnit.mm, left: 36 * PageUnit.mm }, child = null }: Pick<GridPaperOptions, 'margin' | 'child'> = {}): GridPaper {
    return new GridPaper({
      color: '#c8c8de', horizontalInterval: 8 * PageUnit.mm, verticalInterval: 8 * PageUnit.mm,
      horizontalDivisions: 1, verticalDivisions: 4, subdivisions: 1, margin,
      verticalOffset: 1, border: new Border({ left: new BorderSide({ color: '#f6bbcf' }) }),
      opacity: 1, child
    });
  }

  static collegeRuled({ margin = { top: PageUnit.inch, bottom: 0.6 * PageUnit.inch, left: 1.25 * PageUnit.inch }, child = null }: Pick<GridPaperOptions, 'margin' | 'child'> = {}): GridPaper {
    return new GridPaper({
      horizontalInterval: Infinity, verticalInterval: 9 / 32 * PageUnit.inch,
      divisions: 1, subdivisions: 1, margin, verticalOffset: 1,
      border: new Border({ left: new BorderSide({ color: '#ff0000' }) }), opacity: 1, child
    });
  }

  static quad({ color = GRID_COLOR, child = null }: Pick<GridPaperOptions, 'color' | 'child'> = {}): GridPaper {
    return new GridPaper({ color, interval: PageUnit.inch, divisions: 4, subdivisions: 1, child });
  }

  static engineering({ color = GRID_COLOR, child = null }: Pick<GridPaperOptions, 'color' | 'child'> = {}): GridPaper {
    return new GridPaper({ color, interval: PageUnit.inch, divisions: 5, subdivisions: 2, child });
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<GridPaperLayoutData> {
    const parent = BoxConstraints.from(constraints);
    const size = {
      width: parent.hasBoundedWidth ? parent.maxWidth : parent.minWidth,
      height: parent.hasBoundedHeight ? parent.maxHeight : parent.minHeight
    };
    const childBox = this.child?.layout(context, new BoxConstraints({
      maxWidth: Math.max(0, size.width - this.margin.left - this.margin.right),
      maxHeight: Math.max(0, size.height - this.margin.top - this.margin.bottom)
    })) ?? null;
    return { widget: this, width: size.width, height: size.height, data: { childBox } };
  }

  override paint(context: RenderContext, box: PositionedBox<GridPaperLayoutData>): void {
    const childBox = box.data.childBox;
    childBox?.widget.paint(context, {
      ...childBox,
      x: box.x + this.margin.left,
      y: box.y + this.margin.top
    });
    const canvas = context.canvas;
    canvas.saveContext();
    canvas.setGraphicState(new PdfGraphicState({ opacity: this.opacity }));
    const widths = [this.scale, this.scale / 2, this.scale / 4];
    const draw = (
      interval: number,
      divisions: number,
      subdivisions: number,
      offset: number,
      color: ColorInput,
      vertical: boolean
    ): void => {
      if (!Number.isFinite(interval)) return;
      const step = interval / (divisions * subdivisions);
      if (!(step > 0)) return;
      canvas.setStrokeColor(color);
      let n = offset;
      const start = vertical ? box.x + this.margin.left : box.y + this.margin.top;
      const end = vertical
        ? box.x + box.width - this.margin.right
        : box.y + box.height - this.margin.bottom;
      for (let position = start; position <= end + 0.001; position += step) {
        canvas.setLineWidth(n % (subdivisions * divisions) === 0 ? widths[0]! : n % subdivisions === 0 ? widths[1]! : widths[2]!);
        if (vertical) canvas.drawLine(position, canvas.toPdfY(box.y), position, canvas.toPdfY(box.y + box.height));
        else canvas.drawLine(box.x, canvas.toPdfY(position), box.x + box.width, canvas.toPdfY(position));
        canvas.strokePath();
        n++;
      }
    };
    draw(this.horizontalInterval, this.horizontalDivisions, this.horizontalSubdivisions, this.horizontalOffset, this.horizontalColor, true);
    draw(this.verticalInterval, this.verticalDivisions, this.verticalSubdivisions, this.verticalOffset, this.verticalColor, false);
    this.border.paint(context, box.x, box.y, box.width, box.height);
    canvas.restoreContext();
  }
}
