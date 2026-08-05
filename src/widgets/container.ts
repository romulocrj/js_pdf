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
 *   - pdf/lib/src/widgets/container.dart
 *   - pdf/lib/src/widgets/decoration.dart
 *   - pdf/lib/src/widgets/box_border.dart
 *
 * PORT GAP: upstream separates `BoxDecoration` (gradients, images, shapes,
 * shadows, per-side borders, border radius) from `Container`. Here a flat
 * `background` / `borderColor` / `borderWidth` triple is inlined.
 */

import { normalizeColor } from '../pdf/color.ts';
import type { ColorInput, Rgb } from '../pdf/color.ts';
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

export interface ContainerOptions {
  readonly child?: AnyWidget | null;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly padding?: InsetsInput;
  readonly margin?: InsetsInput;
  readonly background?: ColorInput | null;
  readonly borderColor?: ColorInput | null;
  readonly borderWidth?: number;
}

export interface ContainerLayoutData {
  readonly childBox: AnyLayoutBox | null;
  readonly boxWidth: number;
  readonly boxHeight: number;
}

export class Container extends Widget<ContainerLayoutData> {
  readonly child: AnyWidget | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly padding: Insets;
  readonly margin: Insets;
  readonly background: Rgb | null;
  readonly borderColor: Rgb | null;
  readonly borderWidth: number;

  constructor({
    child = null,
    width = null,
    height = null,
    padding = 0,
    margin = 0,
    background = null,
    borderColor = null,
    borderWidth = 1
  }: ContainerOptions = {}) {
    super();
    this.child = child;
    this.width = width == null ? null : Number(width);
    this.height = height == null ? null : Number(height);
    this.padding = normalizeInsets(padding);
    this.margin = normalizeInsets(margin);
    this.background = background == null ? null : normalizeColor(background);
    this.borderColor = borderColor == null ? null : normalizeColor(borderColor);
    this.borderWidth = Number(borderWidth);
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<ContainerLayoutData> {
    const parent = BoxConstraints.from(constraints);
    const outer = parent.deflate(this.margin);
    const desired = outer.tighten({
      width: this.width ?? (outer.hasBoundedWidth ? outer.maxWidth : null),
      height: this.height
    });
    const inner = desired.deflate(this.padding);
    const childBox = this.child?.layout(context, inner) ?? null;
    const content = childBox ?? { width: 0, height: 0 };
    const decorated = desired.constrain({
      width: content.width + this.padding.left + this.padding.right,
      height: content.height + this.padding.top + this.padding.bottom
    });
    const boxWidth = decorated.width;
    const boxHeight = decorated.height;
    const size = parent.constrain({
      width: boxWidth + this.margin.left + this.margin.right,
      height: boxHeight + this.margin.top + this.margin.bottom
    });

    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: { childBox, boxWidth, boxHeight }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<ContainerLayoutData>): void {
    const x = box.x + this.margin.left;
    const y = box.y + this.margin.top;
    const { boxWidth, boxHeight, childBox } = box.data;

    if (this.background) {
      context.canvas.fillRect(x, y, boxWidth, boxHeight, this.background);
    }

    if (this.borderColor && this.borderWidth > 0) {
      context.canvas.strokeRect(x, y, boxWidth, boxHeight, this.borderColor, this.borderWidth);
    }

    if (childBox) {
      childBox.widget.paint(context, {
        ...childBox,
        x: x + this.padding.left,
        y: y + this.padding.top
      });
    }
  }
}
