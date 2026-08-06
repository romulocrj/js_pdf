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
 *   - pdf/lib/src/widgets/partitions.dart
 *
 * Parallel continuation state is immutable. A partition remains active while
 * any column has content, correcting upstream's all-columns-must-continue test,
 * which truncates a longer column as soon as a shorter one finishes.
 */

import type { MainAxisSize } from './flex.ts';
import { BoxConstraints } from './geometry.ts';
import { SpanningWidget } from './widget.ts';
import type {
  AnyLayoutBox,
  AnyWidget,
  Constraints,
  LayoutBox,
  PositionedBox,
  RenderContext,
  SpanLayout
} from './widget.ts';

export interface PartitionOptions {
  readonly child: AnyWidget;
  readonly width?: number | null;
  readonly flex?: number;
}

export interface PartitionState {
  readonly done: boolean;
  readonly childState: unknown;
}

export interface PartitionLayoutData {
  readonly childBox: AnyLayoutBox | null;
}

/** One fixed-width or flexible column in `Partitions`. */
export class Partition extends SpanningWidget<PartitionLayoutData, PartitionState> {
  readonly child: AnyWidget;
  readonly width: number | null;
  readonly flex: number;

  constructor({ child, width = null, flex = 1 }: PartitionOptions) {
    super();
    this.child = child;
    this.width = width === null ? null : Math.max(0, Number(width));
    this.flex = this.width === null ? Math.max(0, Number(flex)) : 0;
  }

  override initialSpanState(): PartitionState {
    return {
      done: false,
      childState: this.child instanceof SpanningWidget
        ? this.child.initialSpanState()
        : null
    };
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<PartitionLayoutData> {
    const childBox = this.child.layout(context, constraints);
    return {
      widget: this,
      width: childBox.width,
      height: childBox.height,
      data: { childBox }
    };
  }

  override layoutSpan(
    context: RenderContext,
    constraints: Constraints,
    state: PartitionState
  ): SpanLayout<PartitionLayoutData, PartitionState> {
    if (state.done) {
      const size = BoxConstraints.from(constraints).constrain({ width: 0, height: 0 });
      return {
        box: { widget: this, width: size.width, height: 0, data: { childBox: null } },
        nextState: state,
        hasMore: false
      };
    }

    if (this.child instanceof SpanningWidget) {
      const fragment = this.child.layoutSpan(context, constraints, state.childState);
      return {
        box: {
          widget: this,
          width: fragment.box.width,
          height: fragment.box.height,
          data: { childBox: fragment.box }
        },
        nextState: { done: !fragment.hasMore, childState: fragment.nextState },
        hasMore: fragment.hasMore
      };
    }

    const childBox = this.child.layout(context, constraints);
    return {
      box: {
        widget: this,
        width: childBox.width,
        height: childBox.height,
        data: { childBox }
      },
      nextState: { done: true, childState: null },
      hasMore: false
    };
  }

  override paint(context: RenderContext, box: PositionedBox<PartitionLayoutData>): void {
    const { childBox } = box.data;
    childBox?.widget.paint(context, { ...childBox, x: box.x, y: box.y });
  }
}

export interface PartitionsOptions {
  readonly children: readonly Partition[];
  readonly mainAxisSize?: MainAxisSize;
}

export interface PartitionsState {
  readonly children: readonly PartitionState[];
}

export interface PartitionChildLayout {
  readonly box: LayoutBox<PartitionLayoutData>;
  readonly dx: number;
}

export interface PartitionsLayoutData {
  readonly children: readonly PartitionChildLayout[];
}

/** Several independently continuing columns sharing one page band. */
export class Partitions extends SpanningWidget<PartitionsLayoutData, PartitionsState> {
  readonly children: readonly Partition[];
  readonly mainAxisSize: MainAxisSize;

  constructor({ children, mainAxisSize = 'max' }: PartitionsOptions) {
    super();
    if (mainAxisSize !== 'min' && mainAxisSize !== 'max') {
      throw new TypeError(`Unknown MainAxisSize: ${mainAxisSize}`);
    }
    this.children = children;
    this.mainAxisSize = mainAxisSize;
  }

  override initialSpanState(): PartitionsState {
    return { children: this.children.map(child => child.initialSpanState()) };
  }

  private widths(constraints: BoxConstraints): readonly number[] {
    const fixed = this.children.reduce((sum, child) => sum + (child.width ?? 0), 0);
    const flex = this.children.reduce((sum, child) => sum + child.flex, 0);
    if (flex > 0 && !constraints.hasBoundedWidth) {
      throw new RangeError('Flexible Partition children require a bounded width');
    }
    const available = Math.max(0, (constraints.hasBoundedWidth ? constraints.maxWidth : fixed) - fixed);
    return this.children.map(child => child.width ?? (flex === 0 ? 0 : available * child.flex / flex));
  }

  private fragment(
    context: RenderContext,
    incoming: Constraints,
    state: PartitionsState
  ): SpanLayout<PartitionsLayoutData, PartitionsState> {
    const constraints = BoxConstraints.from(incoming);
    const widths = this.widths(constraints);
    const children: PartitionChildLayout[] = [];
    const nextStates: PartitionState[] = [];
    let x = 0;
    let height = 0;
    let hasMore = false;

    for (let index = 0; index < this.children.length; index++) {
      const child = this.children[index]!;
      const width = widths[index]!;
      const fragment = child.layoutSpan(context, new BoxConstraints({
        minWidth: width,
        maxWidth: width,
        maxHeight: constraints.maxHeight
      }), state.children[index] ?? child.initialSpanState());
      children.push({ box: fragment.box, dx: x });
      nextStates.push(fragment.nextState);
      x += width;
      height = Math.max(height, fragment.box.height);
      hasMore ||= fragment.hasMore;
    }

    const naturalWidth = this.mainAxisSize === 'max' && constraints.hasBoundedWidth
      ? constraints.maxWidth
      : x;
    const size = constraints.constrain({ width: naturalWidth, height });
    return {
      box: { widget: this, width: size.width, height: size.height, data: { children } },
      nextState: { children: nextStates },
      hasMore
    };
  }

  override layout(context: RenderContext, constraints: Constraints): LayoutBox<PartitionsLayoutData> {
    return this.fragment(context, constraints, this.initialSpanState()).box;
  }

  override layoutSpan(
    context: RenderContext,
    constraints: Constraints,
    state: PartitionsState
  ): SpanLayout<PartitionsLayoutData, PartitionsState> {
    return this.fragment(context, constraints, state);
  }

  override paint(context: RenderContext, box: PositionedBox<PartitionsLayoutData>): void {
    for (const child of box.data.children) {
      child.box.widget.paint(context, {
        ...child.box,
        x: box.x + child.dx,
        y: box.y
      });
    }
  }
}
