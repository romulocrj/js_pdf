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
 */

import { normalizeColor } from '../pdf/color.ts';
import type { ColorInput, Rgb } from '../pdf/color.ts';
import { resolveBasicAlignment } from './basic.ts';
import type { BasicAlignmentInput } from './basic.ts';
import { BoxDecoration, normalizeBoxDecoration } from './decoration.ts';
import type { BoxDecorationInput, DecorationPosition } from './decoration.ts';
import { Alignment, BoxConstraints, inscribe, normalizeInsets } from './geometry.ts';
import type { Insets, InsetsInput } from './geometry.ts';
import { SpanningWidget, Widget } from './widget.ts';
import type {
  AnyLayoutBox,
  AnyWidget,
  Constraints,
  LayoutBox,
  PositionedBox,
  RenderContext,
  SpanLayout
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
  readonly decoration?: BoxDecorationInput | null;
  readonly foregroundDecoration?: BoxDecorationInput | null;
  readonly alignment?: BasicAlignmentInput | null;
}

export interface ContainerLayoutData {
  readonly childBox: AnyLayoutBox | null;
  readonly boxWidth: number;
  readonly boxHeight: number;
  readonly childX: number;
  readonly childY: number;
}

export interface ContainerState {
  readonly childState: unknown;
}

export interface DecoratedBoxOptions {
  readonly decoration: BoxDecorationInput;
  readonly position?: DecorationPosition;
  readonly child?: AnyWidget | null;
}

/** Paints a decoration before or after its child without affecting layout. */
export class DecoratedBox extends Widget<{ readonly childBox: AnyLayoutBox | null }> {
  readonly decoration: BoxDecoration;
  readonly position: DecorationPosition;
  readonly child: AnyWidget | null;

  constructor({ decoration, position = 'background', child = null }: DecoratedBoxOptions) {
    super();
    this.decoration = normalizeBoxDecoration(decoration)!;
    this.position = position;
    this.child = child;
  }

  override layout(
    context: RenderContext,
    constraints: Constraints
  ): LayoutBox<{ readonly childBox: AnyLayoutBox | null }> {
    const parent = BoxConstraints.from(constraints);
    const childBox = this.child?.layout(context, parent) ?? null;
    const size = parent.constrain(childBox ?? { width: 0, height: 0 });
    return { widget: this, width: size.width, height: size.height, data: { childBox } };
  }

  override paint(
    context: RenderContext,
    box: PositionedBox<{ readonly childBox: AnyLayoutBox | null }>
  ): void {
    if (this.position === 'background') {
      this.decoration.paint(context, box.x, box.y, box.width, box.height);
    }
    const { childBox } = box.data;
    childBox?.widget.paint(context, { ...childBox, x: box.x, y: box.y });
    if (this.position === 'foreground') {
      this.decoration.paint(context, box.x, box.y, box.width, box.height);
    }
  }
}

export class Container extends SpanningWidget<ContainerLayoutData, ContainerState> {
  readonly child: AnyWidget | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly padding: Insets;
  readonly margin: Insets;
  readonly background: Rgb | null;
  readonly borderColor: Rgb | null;
  readonly borderWidth: number;
  readonly decoration: BoxDecoration | null;
  readonly foregroundDecoration: BoxDecoration | null;
  readonly alignment: Alignment | null;

  override get canSpan(): boolean {
    return this.height === null
      && this.child instanceof SpanningWidget
      && this.child.canSpan;
  }

  constructor({
    child = null,
    width = null,
    height = null,
    padding = 0,
    margin = 0,
    background = null,
    borderColor = null,
    borderWidth = 1,
    decoration = null,
    foregroundDecoration = null,
    alignment = null
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
    this.decoration = normalizeBoxDecoration(decoration);
    this.foregroundDecoration = normalizeBoxDecoration(foregroundDecoration);
    this.alignment = alignment === null ? null : resolveBasicAlignment(alignment);
    if (this.background !== null && this.decoration !== null) {
      throw new Error('Container cannot have both background and decoration');
    }
  }

  override initialSpanState(): ContainerState {
    return {
      childState: this.child instanceof SpanningWidget
        ? this.child.initialSpanState()
        : null
    };
  }

  private finishLayout(
    parent: BoxConstraints,
    desired: BoxConstraints,
    childBox: AnyLayoutBox | null
  ): LayoutBox<ContainerLayoutData> {
    const content = childBox ?? { width: 0, height: 0 };
    const decorated = desired.constrain({
      width: content.width + this.padding.left + this.padding.right,
      height: content.height + this.padding.top + this.padding.bottom
    });
    const boxWidth = decorated.width;
    const boxHeight = decorated.height;
    const contentWidth = Math.max(0, boxWidth - this.padding.left - this.padding.right);
    const contentHeight = Math.max(0, boxHeight - this.padding.top - this.padding.bottom);
    const childOffset = childBox === null || this.alignment === null
      ? { dx: 0, dy: 0 }
      : inscribe(this.alignment, childBox.width, childBox.height, contentWidth, contentHeight);
    const size = parent.constrain({
      width: boxWidth + this.margin.left + this.margin.right,
      height: boxHeight + this.margin.top + this.margin.bottom
    });

    return {
      widget: this,
      width: size.width,
      height: size.height,
      data: {
        childBox,
        boxWidth,
        boxHeight,
        childX: childOffset.dx,
        childY: childOffset.dy
      }
    };
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<ContainerLayoutData> {
    const parent = BoxConstraints.from(constraints);
    const outer = parent.deflate(this.margin);
    /*
     * Upstream wraps the child in `Align` when an alignment is given, and in an
     * expanding `ConstrainedBox` when there is no child; both fill a bounded
     * axis. With neither, upstream shrink-wraps the child — a container that
     * always filled would stretch every decorated box to the full line width.
     */
    const fill = this.alignment !== null || this.child === null;
    const desired = outer.tighten({
      width: this.width ?? (fill && outer.hasBoundedWidth ? outer.maxWidth : null),
      height: this.height ?? (fill && outer.hasBoundedHeight ? outer.maxHeight : null)
    });
    const inner = desired.deflate(this.padding);
    const childBox = this.child?.layout(context, this.alignment === null ? inner : inner.loosen()) ?? null;
    return this.finishLayout(parent, desired, childBox);
  }

  override layoutSpan(
    context: RenderContext,
    constraints: Constraints,
    state: ContainerState
  ): SpanLayout<ContainerLayoutData, ContainerState> {
    if (!(this.child instanceof SpanningWidget) || !this.canSpan) {
      return {
        box: this.layout(context, constraints),
        nextState: state,
        hasMore: false
      };
    }

    const parent = BoxConstraints.from(constraints);
    const outer = parent.deflate(this.margin);
    const fill = this.alignment !== null || this.child === null;
    const desired = outer.tighten({
      width: this.width ?? (fill && outer.hasBoundedWidth ? outer.maxWidth : null),
      height: this.height ?? (fill && outer.hasBoundedHeight ? outer.maxHeight : null)
    });
    const inner = desired.deflate(this.padding);
    const fragment = this.child.layoutSpan(
      context,
      this.alignment === null ? inner : inner.loosen(),
      state.childState
    );
    return {
      box: this.finishLayout(parent, desired, fragment.box),
      nextState: { childState: fragment.nextState },
      hasMore: fragment.hasMore
    };
  }

  override paint(context: RenderContext, box: PositionedBox<ContainerLayoutData>): void {
    const x = box.x + this.margin.left;
    const y = box.y + this.margin.top;
    const { boxWidth, boxHeight, childBox, childX, childY } = box.data;

    if (this.decoration !== null) {
      this.decoration.paint(context, x, y, boxWidth, boxHeight);
    } else if (this.background) {
      context.canvas.fillRect(x, y, boxWidth, boxHeight, this.background);
    }

    if (this.borderColor && this.borderWidth > 0) {
      context.canvas.strokeRect(x, y, boxWidth, boxHeight, this.borderColor, this.borderWidth);
    }

    if (childBox) {
      childBox.widget.paint(context, {
        ...childBox,
        x: x + this.padding.left + childX,
        y: y + this.padding.top + childY
      });
    }

    this.foregroundDecoration?.paint(context, x, y, boxWidth, boxHeight);
  }
}
