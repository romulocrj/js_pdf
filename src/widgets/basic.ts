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
 *   - pdf/lib/src/widgets/basic.dart
 *   - pdf/lib/src/widgets/geometry.dart
 *
 * The composition widgets: `Padding`, `Align`, `Center`, `SizedBox`, `Divider`.
 *
 * PORT GAP: `basic.dart` also holds `Transform`, `Opacity`, `FittedBox`,
 * `AspectRatio`, `ConstrainedBox`, `LimitedBox`, `OverflowBox`, `CustomPaint`,
 * `FullPage`, `Builder` and `LayoutBuilder`. Three of those are blocked on
 * subsystems that do not exist yet — `Transform` needs the `cm` operator
 * (phase 2.1), `Opacity` needs real `/ExtGState` graphic states, and `FittedBox`
 * needs `Transform`. The rest are deferred with them rather than landed
 * piecemeal.
 *
 * PORT GAP: `ConstrainedBox` in particular waits on a real `BoxConstraints`
 * value type. This port's `Constraints` carries maxima only, which is enough for
 * everything here — `SizedBox` states its own size outright rather than
 * tightening a constraint. Minimums become necessary for `Expanded` and
 * `Flexible` in phase 3.4, and that is the change that should introduce them.
 */

import { normalizeColor } from '../pdf/color.ts';
import type { ColorInput, Rgb } from '../pdf/color.ts';
import { Alignment, inscribe, insetsHorizontal, insetsVertical, normalizeInsets } from './geometry.ts';
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

/** What a widget with one optional child hands from `layout` to `paint`. */
export interface SingleChildLayoutData {
  readonly childBox: AnyLayoutBox | null;
}

export interface PaddingOptions {
  readonly padding?: InsetsInput;
  readonly child?: AnyWidget | null;
}

/** Insets its child by `padding`, growing by that much in each direction. */
export class Padding extends Widget<SingleChildLayoutData> {
  readonly padding: Insets;
  readonly child: AnyWidget | null;

  constructor({ padding = 0, child = null }: PaddingOptions = {}) {
    super();
    this.padding = normalizeInsets(padding);
    this.child = child;
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<SingleChildLayoutData> {
    const horizontal = insetsHorizontal(this.padding);
    const vertical = insetsVertical(this.padding);

    if (this.child === null) {
      return {
        widget: this,
        width: Math.min(constraints.maxWidth, horizontal),
        height: Math.min(constraints.maxHeight, vertical),
        data: { childBox: null }
      };
    }

    const childBox = this.child.layout(context, {
      maxWidth: Math.max(0, constraints.maxWidth - horizontal),
      maxHeight: Math.max(0, constraints.maxHeight - vertical)
    });

    return {
      widget: this,
      width: Math.min(constraints.maxWidth, childBox.width + horizontal),
      height: childBox.height + vertical,
      data: { childBox }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<SingleChildLayoutData>): void {
    const { childBox } = box.data;
    if (childBox === null) return;

    childBox.widget.paint(context, {
      ...childBox,
      x: box.x + this.padding.left,
      y: box.y + this.padding.top
    });
  }
}

/** `Align` places its child, so it carries the child's offset within its box. */
export interface AlignLayoutData extends SingleChildLayoutData {
  readonly dx: number;
  readonly dy: number;
}

export interface AlignOptions {
  readonly alignment?: Alignment;
  readonly widthFactor?: number | null;
  readonly heightFactor?: number | null;
  readonly child?: AnyWidget | null;
}

/**
 * Positions its child inside itself according to `alignment`.
 *
 * Sizing follows upstream: an axis shrink-wraps the child when a factor is given
 * for it, and otherwise fills the constraint. Upstream also shrink-wraps an axis
 * whose constraint is infinite, which never happens here — this port's
 * constraints are always finite — so the practical rule is *fill unless a factor
 * says otherwise*.
 *
 * PORT GAP, and a sharp edge worth knowing: upstream's `Flex` gives its children
 * an infinite main-axis constraint, so an `Align` inside a `Column` shrink-wraps
 * its height there. This port's `Column` passes the remaining page height
 * instead, so an `Align` inside one currently claims all of it. Pass
 * `heightFactor: 1` to shrink-wrap in the meantime. The real fix is phase 3.4's
 * flex algorithm, not a special case here.
 */
export class Align extends Widget<AlignLayoutData> {
  readonly alignment: Alignment;
  readonly widthFactor: number | null;
  readonly heightFactor: number | null;
  readonly child: AnyWidget | null;

  constructor({
    alignment = Alignment.center,
    widthFactor = null,
    heightFactor = null,
    child = null
  }: AlignOptions = {}) {
    super();
    this.alignment = alignment;
    this.widthFactor = widthFactor;
    this.heightFactor = heightFactor;
    this.child = child;
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<AlignLayoutData> {
    if (this.child === null) {
      return {
        widget: this,
        width: this.widthFactor === null ? constraints.maxWidth : 0,
        height: this.heightFactor === null ? constraints.maxHeight : 0,
        data: { childBox: null, dx: 0, dy: 0 }
      };
    }

    const childBox = this.child.layout(context, constraints);

    const width = this.widthFactor === null
      ? constraints.maxWidth
      : Math.min(constraints.maxWidth, childBox.width * this.widthFactor);
    const height = this.heightFactor === null
      ? constraints.maxHeight
      : Math.min(constraints.maxHeight, childBox.height * this.heightFactor);

    const offset = inscribe(this.alignment, childBox.width, childBox.height, width, height);

    return {
      widget: this,
      width,
      height,
      data: { childBox, dx: offset.dx, dy: offset.dy }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<AlignLayoutData>): void {
    const { childBox, dx, dy } = box.data;
    if (childBox === null) return;

    childBox.widget.paint(context, { ...childBox, x: box.x + dx, y: box.y + dy });
  }
}

export interface CenterOptions {
  readonly widthFactor?: number | null;
  readonly heightFactor?: number | null;
  readonly child?: AnyWidget | null;
}

/** `Align` fixed to the centre, exactly as upstream defines it. */
export class Center extends Align {
  constructor({ widthFactor = null, heightFactor = null, child = null }: CenterOptions = {}) {
    super({ alignment: Alignment.center, widthFactor, heightFactor, child });
  }
}

export interface SizedBoxOptions {
  readonly width?: number | null;
  readonly height?: number | null;
  readonly child?: AnyWidget | null;
}

/**
 * A box of a stated size.
 *
 * Upstream builds a `ConstrainedBox` with tight constraints, which forces the
 * child to that exact size. Without minimums in `Constraints` this instead
 * *offers* the size to the child as a maximum and reports the stated size
 * regardless of what the child took — the box occupies the right space either
 * way, and a child that would have stretched into it simply does not. That
 * distinction disappears when phase 3.4 introduces real `BoxConstraints`.
 *
 * With no child and no size, this is upstream's `SizedBox.shrink()`.
 */
export class SizedBox extends Widget<SingleChildLayoutData> {
  readonly width: number | null;
  readonly height: number | null;
  readonly child: AnyWidget | null;

  constructor({ width = null, height = null, child = null }: SizedBoxOptions = {}) {
    super();
    this.width = width === null ? null : Number(width);
    this.height = height === null ? null : Number(height);
    this.child = child;
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<SingleChildLayoutData> {
    const maxWidth = Math.min(constraints.maxWidth, this.width ?? constraints.maxWidth);
    const maxHeight = Math.min(constraints.maxHeight, this.height ?? constraints.maxHeight);
    const childBox = this.child === null
      ? null
      : this.child.layout(context, { maxWidth, maxHeight });

    return {
      widget: this,
      width: this.width ?? childBox?.width ?? 0,
      height: this.height ?? childBox?.height ?? 0,
      data: { childBox }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<SingleChildLayoutData>): void {
    const { childBox } = box.data;
    if (childBox === null) return;

    childBox.widget.paint(context, { ...childBox, x: box.x, y: box.y });
  }
}

export interface DividerOptions {
  readonly height?: number;
  readonly thickness?: number;
  readonly indent?: number;
  readonly endIndent?: number;
  readonly color?: ColorInput;
}

export const DEFAULT_DIVIDER_HEIGHT = 16;
export const DEFAULT_DIVIDER_THICKNESS = 1;

/**
 * A horizontal rule: a `thickness`-tall line centred in a `height`-tall box,
 * inset by `indent` at the leading edge and `endIndent` at the trailing one.
 *
 * Upstream composes this out of `SizedBox` + `Center` + `Container` +
 * `BoxDecoration` + `Border` + `BorderSide`. Decoration is phase 3.5, so the
 * port fills the rule directly; the emitted `re f` is what upstream's bottom
 * border would have produced anyway. Revisit the composition when 3.5 lands.
 */
export class Divider extends Widget<null> {
  readonly height: number;
  readonly thickness: number;
  readonly indent: number;
  readonly endIndent: number;
  readonly color: Rgb;

  constructor({
    height = DEFAULT_DIVIDER_HEIGHT,
    thickness = DEFAULT_DIVIDER_THICKNESS,
    indent = 0,
    endIndent = 0,
    color = '#000000'
  }: DividerOptions = {}) {
    super();
    this.height = Math.max(0, Number(height));
    this.thickness = Math.max(0, Number(thickness));
    this.indent = Math.max(0, Number(indent));
    this.endIndent = Math.max(0, Number(endIndent));
    this.color = normalizeColor(color);
  }

  override layout(_context: RenderContext, constraints: Constraints): LayoutBox<null> {
    return {
      widget: this,
      width: constraints.maxWidth,
      height: Math.min(constraints.maxHeight, this.height),
      data: null
    };
  }

  override paint(context: RenderContext, box: PositionedBox<null>): void {
    const width = Math.max(0, box.width - this.indent - this.endIndent);
    if (width === 0 || this.thickness === 0) return;

    context.canvas.fillRect(
      box.x + this.indent,
      box.y + (box.height - this.thickness) / 2,
      width,
      this.thickness,
      this.color
    );
  }
}
