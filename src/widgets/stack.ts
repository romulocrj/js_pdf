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
 *   - pdf/lib/src/widgets/stack.dart
 *
 * Positioned width and height are explicit inputs in the port. Upstream reads
 * them from the child's previous mutable box before laying that child out,
 * which makes the result depend on whether the widget happened to be reused.
 */

import { resolveBasicAlignment } from './basic.ts';
import type { BasicAlignmentInput } from './basic.ts';
import { Alignment, BoxConstraints, inscribe } from './geometry.ts';
import type { TextDirection } from './border_radius.ts';
import { Widget } from './widget.ts';
import type {
  AnyLayoutBox,
  AnyWidget,
  Constraints,
  LayoutBox,
  PositionedBox,
  RenderContext
} from './widget.ts';

export type StackFit = 'loose' | 'expand' | 'passthrough';
export type StackOverflow = 'visible' | 'clip';

export interface PositionedOptions {
  readonly left?: number | null;
  readonly top?: number | null;
  readonly right?: number | null;
  readonly bottom?: number | null;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly child: AnyWidget;
}

export interface PositionedLayoutData {
  readonly childBox: AnyLayoutBox;
}

/** Marks a direct `Stack` child as edge-positioned. */
export class Positioned extends Widget<PositionedLayoutData> {
  readonly left: number | null;
  readonly top: number | null;
  readonly right: number | null;
  readonly bottom: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly child: AnyWidget;

  constructor({
    left = null,
    top = null,
    right = null,
    bottom = null,
    width = null,
    height = null,
    child
  }: PositionedOptions) {
    super();
    this.left = left === null ? null : Number(left);
    this.top = top === null ? null : Number(top);
    this.right = right === null ? null : Number(right);
    this.bottom = bottom === null ? null : Number(bottom);
    this.width = width === null ? null : Math.max(0, Number(width));
    this.height = height === null ? null : Math.max(0, Number(height));
    this.child = child;
  }

  static fill({
    left = 0,
    top = 0,
    right = 0,
    bottom = 0,
    child
  }: Omit<PositionedOptions, 'width' | 'height'>): Positioned {
    return new Positioned({ left, top, right, bottom, child });
  }

  static directional({
    textDirection,
    start = null,
    top = null,
    end = null,
    bottom = null,
    width = null,
    height = null,
    child
  }: PositionedDirectionalOptions & { readonly textDirection: TextDirection }): Positioned {
    return new Positioned({
      left: textDirection === 'rtl' ? end : start,
      right: textDirection === 'rtl' ? start : end,
      top,
      bottom,
      width,
      height,
      child
    });
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<PositionedLayoutData> {
    const parent = BoxConstraints.from(constraints).tighten({
      width: this.width,
      height: this.height
    });
    const childBox = this.child.layout(context, parent);
    return {
      widget: this,
      width: childBox.width,
      height: childBox.height,
      data: { childBox }
    };
  }

  override paint(context: RenderContext, box: PositionedBox<PositionedLayoutData>): void {
    const { childBox } = box.data;
    childBox.widget.paint(context, { ...childBox, x: box.x, y: box.y });
  }
}

export interface PositionedDirectionalOptions {
  readonly start?: number | null;
  readonly top?: number | null;
  readonly end?: number | null;
  readonly bottom?: number | null;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly child: AnyWidget;
  readonly textDirection?: TextDirection;
}

/** Direction-aware positioned child, resolved at construction in this port. */
export class PositionedDirectional extends Positioned {
  readonly start: number | null;
  readonly end: number | null;
  readonly textDirection: TextDirection;

  constructor({
    start = null,
    top = null,
    end = null,
    bottom = null,
    width = null,
    height = null,
    child,
    textDirection = 'ltr'
  }: PositionedDirectionalOptions) {
    super({
      left: textDirection === 'rtl' ? end : start,
      right: textDirection === 'rtl' ? start : end,
      top,
      bottom,
      width,
      height,
      child
    });
    this.start = start;
    this.end = end;
    this.textDirection = textDirection;
  }

  static override fill({
    start = 0,
    top = 0,
    end = 0,
    bottom = 0,
    child,
    textDirection = 'ltr'
  }: Omit<PositionedDirectionalOptions, 'width' | 'height'>): PositionedDirectional {
    return new PositionedDirectional({ start, top, end, bottom, child, textDirection });
  }
}

export interface StackOptions {
  readonly alignment?: BasicAlignmentInput;
  readonly fit?: StackFit;
  readonly overflow?: StackOverflow;
  readonly children?: readonly AnyWidget[];
}

export interface StackChildLayout {
  readonly box: AnyLayoutBox;
  readonly dx: number;
  readonly dy: number;
}

export interface StackLayoutData {
  readonly children: readonly StackChildLayout[];
}

/** Overlays children inside one shared box. */
export class Stack extends Widget<StackLayoutData> {
  readonly alignment: Alignment;
  readonly fit: StackFit;
  readonly overflow: StackOverflow;
  readonly children: readonly AnyWidget[];

  constructor({
    alignment = Alignment.topLeft,
    fit = 'loose',
    overflow = 'clip',
    children = []
  }: StackOptions = {}) {
    super();
    this.alignment = resolveBasicAlignment(alignment);
    if (!['loose', 'expand', 'passthrough'].includes(fit)) {
      throw new TypeError(`Unknown StackFit: ${fit}`);
    }
    if (overflow !== 'visible' && overflow !== 'clip') {
      throw new TypeError(`Unknown Stack overflow: ${overflow}`);
    }
    this.fit = fit;
    this.overflow = overflow;
    this.children = children;
  }

  override layout(context: RenderContext, incoming: Constraints): LayoutBox<StackLayoutData> {
    const constraints = BoxConstraints.from(incoming);
    const measured = new Map<AnyWidget, AnyLayoutBox>();
    let width = constraints.minWidth;
    let height = constraints.minHeight;
    let hasNonPositioned = false;
    const nonPositionedConstraints = this.fit === 'loose'
      ? constraints.loosen()
      : this.fit === 'expand'
        ? BoxConstraints.tight(constraints.biggest)
        : constraints;

    for (const child of this.children) {
      if (child instanceof Positioned) continue;
      hasNonPositioned = true;
      const childBox = child.layout(context, nonPositionedConstraints);
      measured.set(child, childBox);
      width = Math.max(width, childBox.width);
      height = Math.max(height, childBox.height);
    }

    const size = hasNonPositioned
      ? constraints.constrain({ width, height })
      : constraints.constrain({
        width: constraints.hasBoundedWidth ? constraints.maxWidth : 0,
        height: constraints.hasBoundedHeight ? constraints.maxHeight : 0
      });
    const placed: StackChildLayout[] = [];

    for (const child of this.children) {
      if (!(child instanceof Positioned)) {
        const childBox = measured.get(child)!;
        const offset = inscribe(this.alignment, childBox.width, childBox.height, size.width, size.height);
        placed.push({ box: childBox, dx: offset.dx, dy: offset.dy });
        continue;
      }

      let positionedConstraints = new BoxConstraints();
      const tightWidth = child.left !== null && child.right !== null
        ? Math.max(0, size.width - child.left - child.right)
        : child.width;
      const tightHeight = child.top !== null && child.bottom !== null
        ? Math.max(0, size.height - child.top - child.bottom)
        : child.height;
      positionedConstraints = positionedConstraints.tighten({
        width: tightWidth,
        height: tightHeight
      });
      const childBox = child.layout(context, positionedConstraints);
      const aligned = inscribe(this.alignment, childBox.width, childBox.height, size.width, size.height);
      const dx = child.left !== null
        ? child.left
        : child.right !== null
          ? size.width - child.right - childBox.width
          : aligned.dx;
      const dy = child.top !== null
        ? child.top
        : child.bottom !== null
          ? size.height - child.bottom - childBox.height
          : aligned.dy;
      placed.push({ box: childBox, dx, dy });
    }

    return { widget: this, width: size.width, height: size.height, data: { children: placed } };
  }

  override paint(context: RenderContext, box: PositionedBox<StackLayoutData>): void {
    if (this.overflow === 'clip') {
      context.canvas.saveContext();
      context.canvas.drawRect(
        box.x,
        context.canvas.pageHeight - box.y - box.height,
        box.width,
        box.height
      );
      context.canvas.clipPath();
    }
    for (const child of box.data.children) {
      child.box.widget.paint(context, {
        ...child.box,
        x: box.x + child.dx,
        y: box.y + child.dy
      });
    }
    if (this.overflow === 'clip') context.canvas.restoreContext();
  }
}
