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
 *   - pdf/lib/src/widgets/container.dart
 */

import { normalizePaintColor } from '../pdf/color.ts';
import type { ColorInput, PaintColor } from '../pdf/color.ts';
import { resolveBasicAlignment } from './basic.ts';
import type { BasicAlignmentInput } from './basic.ts';
import { BoxDecoration, normalizeBoxDecoration } from './decoration.ts';
import type { BoxDecorationInput, DecorationPosition } from './decoration.ts';
import { BoxConstraints, inscribe, normalizeInsetsGeometry } from './geometry.ts';
import type { AlignmentGeometry, Insets, InsetsGeometry, InsetsInput } from './geometry.ts';
import { alignmentIn, insetsIn } from './directionality.ts';
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
  /** Upstream's shorthand for `decoration: { color }`. */
  readonly color?: ColorInput | null;
  /** The port's original name for `color`, kept as an alias. */
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
  readonly padding: InsetsGeometry;
  readonly margin: InsetsGeometry;
  readonly background: PaintColor | null;
  readonly borderColor: PaintColor | null;
  readonly borderWidth: number;
  readonly decoration: BoxDecoration | null;
  readonly foregroundDecoration: BoxDecoration | null;
  readonly alignment: AlignmentGeometry | null;

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
    color = null,
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
    this.padding = normalizeInsetsGeometry(padding);
    this.margin = normalizeInsetsGeometry(margin);
    /*
     * `color` is upstream's name; the port only read `background`, so an
     * upstream `Container(color: ...)` silently lost its fill.
     */
    if (color != null && background != null) {
      throw new Error('Container cannot have both color and background');
    }
    const fill = color ?? background;
    this.background = fill == null ? null : normalizePaintColor(fill);
    this.borderColor = borderColor == null ? null : normalizePaintColor(borderColor);
    this.borderWidth = Number(borderWidth);
    this.decoration = normalizeBoxDecoration(decoration);
    this.foregroundDecoration = normalizeBoxDecoration(foregroundDecoration);
    this.alignment = alignment === null ? null : resolveBasicAlignment(alignment);
    if (this.background !== null && this.decoration !== null) {
      throw new Error('Container cannot have both a color and a decoration');
    }
  }

  override initialSpanState(): ContainerState {
    return {
      childState: this.child instanceof SpanningWidget
        ? this.child.initialSpanState()
        : null
    };
  }

  /** Margin and padding in physical edges, for the ambient text direction. */
  private edges(context: RenderContext): readonly [Insets, Insets] {
    return [insetsIn(context, this.margin), insetsIn(context, this.padding)];
  }

  private finishLayout(
    context: RenderContext,
    parent: BoxConstraints,
    desired: BoxConstraints,
    childBox: AnyLayoutBox | null
  ): LayoutBox<ContainerLayoutData> {
    const [margin, padding] = this.edges(context);
    const content = childBox ?? { width: 0, height: 0 };
    const decorated = desired.constrain({
      width: content.width + padding.left + padding.right,
      height: content.height + padding.top + padding.bottom
    });
    const boxWidth = decorated.width;
    const boxHeight = decorated.height;
    const contentWidth = Math.max(0, boxWidth - padding.left - padding.right);
    const contentHeight = Math.max(0, boxHeight - padding.top - padding.bottom);
    const childOffset = childBox === null || this.alignment === null
      ? { dx: 0, dy: 0 }
      : inscribe(alignmentIn(context, this.alignment), childBox.width, childBox.height, contentWidth, contentHeight);
    const size = parent.constrain({
      width: boxWidth + margin.left + margin.right,
      height: boxHeight + margin.top + margin.bottom
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
    const [margin, padding] = this.edges(context);
    const outer = parent.deflate(margin);
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
    const inner = desired.deflate(padding);
    const childBox = this.child?.layout(context, this.alignment === null ? inner : inner.loosen()) ?? null;
    return this.finishLayout(context, parent, desired, childBox);
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
    const [margin, padding] = this.edges(context);
    const outer = parent.deflate(margin);
    const fill = this.alignment !== null || this.child === null;
    const desired = outer.tighten({
      width: this.width ?? (fill && outer.hasBoundedWidth ? outer.maxWidth : null),
      height: this.height ?? (fill && outer.hasBoundedHeight ? outer.maxHeight : null)
    });
    const inner = desired.deflate(padding);
    const fragment = this.child.layoutSpan(
      context,
      this.alignment === null ? inner : inner.loosen(),
      state.childState
    );
    return {
      box: this.finishLayout(context, parent, desired, fragment.box),
      nextState: { childState: fragment.nextState },
      hasMore: fragment.hasMore
    };
  }

  override paint(context: RenderContext, box: PositionedBox<ContainerLayoutData>): void {
    const [margin, padding] = this.edges(context);
    const x = box.x + margin.left;
    const y = box.y + margin.top;
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
        x: x + padding.left + childX,
        y: y + padding.top + childY
      });
    }

    this.foregroundDecoration?.paint(context, x, y, boxWidth, boxHeight);
  }
}
