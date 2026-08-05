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
 *   - pdf/lib/src/widgets/flex.dart
 *
 * PORT GAP: upstream `Flex` implements the full Flutter flex algorithm
 * (mainAxisAlignment, crossAxisAlignment, Expanded/Flexible, FlexFit,
 * mainAxisSize, text baseline alignment). This file supports a `gap` and, for
 * `Row`, fixed ratio `widths`.
 */

import { normalizeInsets } from './geometry.ts';
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

export interface ColumnOptions {
  readonly children?: readonly AnyWidget[];
  readonly gap?: number;
  readonly margin?: InsetsInput;
}

export interface RowOptions extends ColumnOptions {
  /** Relative column widths. Defaults to equal shares. */
  readonly widths?: readonly number[] | null;
}

export interface FlexLayoutData {
  readonly childBoxes: readonly AnyLayoutBox[];
}

/** A child box plus the track width `Row` allocated to it. */
export type RowChildBox = AnyLayoutBox & { readonly allocatedWidth: number };

export interface RowLayoutData {
  readonly childBoxes: readonly RowChildBox[];
}

/** Fixed vertical gap. Upstream `Spacer` is proportional flex space. */
export class Spacer extends Widget<null> {
  readonly requestedHeight: number;

  constructor(height = 8) {
    super();
    this.requestedHeight = Number(height);
  }

  override layout(_context: RenderContext, constraints: Constraints): LayoutBox<null> {
    return {
      widget: this,
      width: constraints.maxWidth,
      height: Math.max(0, this.requestedHeight),
      data: null
    };
  }

  override paint(): void {}
}

export class Column extends Widget<FlexLayoutData> {
  readonly children: readonly AnyWidget[];
  readonly gap: number;
  readonly margin: Insets;

  constructor({ children = [], gap = 0, margin = 0 }: ColumnOptions = {}) {
    super();
    this.children = children;
    this.gap = Number(gap);
    this.margin = normalizeInsets(margin);
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<FlexLayoutData> {
    const innerWidth = Math.max(0, constraints.maxWidth - this.margin.left - this.margin.right);
    const childBoxes: AnyLayoutBox[] = [];
    let height = this.margin.top + this.margin.bottom;
    let width = 0;

    for (let index = 0; index < this.children.length; index++) {
      const child = this.children[index] as AnyWidget;
      const childBox = child.layout(context, { maxWidth: innerWidth, maxHeight: constraints.maxHeight });
      childBoxes.push(childBox);
      height += childBox.height;
      width = Math.max(width, childBox.width);
      if (index < this.children.length - 1) height += this.gap;
    }

    return {
      widget: this,
      width: Math.min(constraints.maxWidth, width + this.margin.left + this.margin.right),
      height,
      data: { childBoxes }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<FlexLayoutData>): void {
    let y = box.y + this.margin.top;
    for (const childBox of box.data.childBoxes) {
      childBox.widget.paint(context, { ...childBox, x: box.x + this.margin.left, y });
      y += childBox.height + this.gap;
    }
  }
}

export class Row extends Widget<RowLayoutData> {
  readonly children: readonly AnyWidget[];
  readonly gap: number;
  readonly widths: readonly number[] | null;
  readonly margin: Insets;

  constructor({ children = [], gap = 0, widths = null, margin = 0 }: RowOptions = {}) {
    super();
    this.children = children;
    this.gap = Number(gap);
    this.widths = widths;
    this.margin = normalizeInsets(margin);
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<RowLayoutData> {
    const available = Math.max(0, constraints.maxWidth - this.margin.left - this.margin.right - Math.max(0, this.children.length - 1) * this.gap);
    const ratios = this.widths ?? this.children.map(() => 1);
    const totalRatio = ratios.reduce((sum, value) => sum + Number(value), 0) || 1;
    const childBoxes: RowChildBox[] = [];
    let height = 0;

    for (let index = 0; index < this.children.length; index++) {
      const child = this.children[index] as AnyWidget;
      const width = available * Number(ratios[index] ?? 1) / totalRatio;
      const childBox = child.layout(context, {
        maxWidth: width,
        maxHeight: constraints.maxHeight
      });
      childBoxes.push({ ...childBox, allocatedWidth: width });
      height = Math.max(height, childBox.height);
    }

    return {
      widget: this,
      width: constraints.maxWidth,
      height: height + this.margin.top + this.margin.bottom,
      data: { childBoxes }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<RowLayoutData>): void {
    let x = box.x + this.margin.left;
    for (const childBox of box.data.childBoxes) {
      childBox.widget.paint(context, { ...childBox, x, y: box.y + this.margin.top });
      x += childBox.allocatedWidth + this.gap;
    }
  }
}
