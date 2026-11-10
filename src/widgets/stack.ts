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
 *   - pdf/lib/src/widgets/stack.dart
 *
 * Positioned width and height are explicit inputs in the port. Upstream reads
 * them from the child's previous mutable box before laying that child out,
 * which makes the result depend on whether the widget happened to be reused.
 */

import { resolveBasicAlignment } from './basic.ts';
import type { BasicAlignmentInput } from './basic.ts';
import { Alignment, BoxConstraints, inscribe, resolveAlignment } from './geometry.ts';
import type { AlignmentGeometry } from './geometry.ts';
import type { TextDirection } from './border_radius.ts';
import { Directionality } from './directionality.ts';
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
  /** Port extension: resolve against this instead of the ambient direction. */
  readonly textDirection?: TextDirection | null;
}

/**
 * A positioned child placed by `start` and `end`. Upstream resolves them with
 * `Directionality.of` when it is laid out, and so does the port: `left` and
 * `right` hold the ltr reading, and a `Stack` swaps them under rtl. A given
 * `textDirection` resolves them once, here, as this port always used to.
 */
export class PositionedDirectional extends Positioned {
  readonly start: number | null;
  readonly end: number | null;
  readonly textDirection: TextDirection | null;

  constructor({
    start = null,
    top = null,
    end = null,
    bottom = null,
    width = null,
    height = null,
    child,
    textDirection = null
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
    textDirection = null
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
  readonly alignment: AlignmentGeometry;
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
    /*
     * `expand` tightens only the bounded axes, as upstream PR #1980 does: inside
     * a Row the width is unbounded, and a tight infinite constraint reached the
     * clip rectangle as `Infinity`.
     */
    const nonPositionedConstraints = this.fit === 'loose'
      ? constraints.loosen()
      : this.fit === 'expand'
        ? new BoxConstraints({
          minWidth: constraints.hasBoundedWidth ? constraints.maxWidth : 0,
          maxWidth: constraints.maxWidth,
          minHeight: constraints.hasBoundedHeight ? constraints.maxHeight : 0,
          maxHeight: constraints.maxHeight
        })
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
    const direction = Directionality.of(context);
    const alignment = resolveAlignment(this.alignment, direction);

    for (const child of this.children) {
      if (!(child instanceof Positioned)) {
        const childBox = measured.get(child)!;
        const offset = inscribe(alignment, childBox.width, childBox.height, size.width, size.height);
        placed.push({ box: childBox, dx: offset.dx, dy: offset.dy });
        continue;
      }

      // `left` and `right` of an unresolved PositionedDirectional are its ltr reading.
      const [left, right] = direction === 'rtl' && child instanceof PositionedDirectional
        && child.textDirection === null
        ? [child.right, child.left]
        : [child.left, child.right];
      let positionedConstraints = new BoxConstraints();
      const tightWidth = left !== null && right !== null
        ? Math.max(0, size.width - left - right)
        : child.width;
      const tightHeight = child.top !== null && child.bottom !== null
        ? Math.max(0, size.height - child.top - child.bottom)
        : child.height;
      positionedConstraints = positionedConstraints.tighten({
        width: tightWidth,
        height: tightHeight
      });
      const childBox = child.layout(context, positionedConstraints);
      const aligned = inscribe(alignment, childBox.width, childBox.height, size.width, size.height);
      const dx = left !== null
        ? left
        : right !== null
          ? size.width - right - childBox.width
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
